import { useEffect, useRef, useState } from 'react'
import { ThinkingOrb } from 'thinking-orbs'
import type { OrbState } from './states'
import { runChat, PROVIDERS, providerAvailable, anyKeyPresent, pickProvider, stripToolLeakage, type ChatMessage, type Provider, type ToolExecutor } from '../lib/llm'
import { speechSupported, useSpeech, useWakeWord } from '../lib/speech'
import { speak, stopSpeaking, ttsAvailable, whenAudioReady, enqueueSpeech, waitForSpeechIdle, getVoiceSpectrum, forceAudioUnlock } from '../lib/tts'
import { getSettings, setSetting } from '../lib/settings'
import { appendChatLog } from '../lib/memlog'
import { isDesktop } from '../lib/os'

const orangeTint = {
  filter: 'sepia(1) saturate(4) hue-rotate(-15deg) brightness(1.15)',
}

// time-aware greetings, JARVIS style
function pickGreeting(): string {
  const h = new Date().getHours()
  const pool =
    h >= 5 && h < 12
      ? ['Good morning sir. All systems are online.', 'Good morning sir. Ready when you are.']
      : h >= 12 && h < 17
        ? ['Good afternoon sir. How can I help?', 'Good afternoon sir. At your service.']
        : h >= 17 && h < 22
          ? ['Good evening sir. Systems standing by.', 'Good evening sir. What do you need?']
          : ['Working late again, sir? I\u2019m here.', 'Burning the midnight oil, sir? At your service.']
  return pool[Math.floor(Math.random() * pool.length)]
}

// direct questions about identity get a fixed answer, no model call
const IDENTITY_RE = /\b(who\s*(are|r)\s*(you|u)|what\s*(are|r)\s*(you|u)|your name|who\s*(made|created|built|developed|designed)\s*(you|u)|who'?s your (creator|developer|maker|builder))\b/i
const IDENTITY_REPLY = 'I am Jarvis, developed by Mahim Abdullah Rianto.'

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none" />
      {muted ? (
        <>
          <line x1="16" y1="9" x2="22" y2="15" />
          <line x1="22" y1="9" x2="16" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      )}
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// live voice waveform — mirrors the analyser feeding the talking orb
function VoiceWave() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    let raf = 0
    const draw = () => {
      const bars = getVoiceSpectrum(30)
      const w = cv.width
      const h = cv.height
      const bw = w / bars.length
      ctx.clearRect(0, 0, w, h)
      bars.forEach((v, i) => {
        const bh = Math.max(2, v * (h - 2))
        ctx.fillStyle = v > 0.03 ? `rgba(255, 150, 60, ${0.55 + v * 0.45})` : 'rgba(255, 140, 46, 0.18)'
        ctx.fillRect(i * bw + 1.5, (h - bh) / 2, bw - 3, bh)
      })
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="voice-wave-wrap">
      <canvas ref={ref} className="voice-wave" width={300} height={22} />
      <span className="voice-wave-label">AUDIO</span>
    </div>
  )
}

interface Message {
  role: 'jarvis' | 'user'
  text: string
}

interface Props {
  state: OrbState
  hidden: boolean
  onRequestOpen: () => void
  onOpenBrowser: (url: string) => void
  onStateChange: (s: OrbState) => void
  executeUICommand: ToolExecutor
  onCollapse: () => void
}

export default function Console({ state, hidden, onRequestOpen, onOpenBrowser, onStateChange, executeUICommand, onCollapse }: Props) {
  // thinking-orbs has no 'talking' state — map it for the mini avatars
  const orbState = state === 'talking' ? 'composing' : state
  // 'auto' routes per message; otherwise a pinned provider id (default from settings)
  const [mode, setMode] = useState<'auto' | string>(() => {
    const pref = getSettings().defaultMode
    if (pref !== 'auto' && PROVIDERS.some((p) => p.id === pref && providerAvailable(p))) return pref
    return anyKeyPresent ? 'auto' : PROVIDERS[0].id
  })
  const [lastUsed, setLastUsed] = useState<Provider | null>(null)
  const [modelOpen, setModelOpen] = useState(false)
  const pinned = mode === 'auto' ? null : PROVIDERS.find((p) => p.id === mode) ?? PROVIDERS[0]
  const activeReady = mode === 'auto' ? anyKeyPresent : !!pinned && providerAvailable(pinned)
  const modelLabel = mode === 'auto' ? `AUTO${lastUsed ? ` · ${lastUsed.short}` : ''}` : pinned!.short
  const greeting = useRef(pickGreeting()).current
  const greetedRef = useRef(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'jarvis',
      text: anyKeyPresent
        ? greeting
        : 'Systems online, but no API key detected. Add VITE_GROQ_API_KEY or VITE_GEMINI_API_KEY to frontend/.env and restart the dev server.',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [voiceOn, setVoiceOn] = useState(() => getSettings().voiceOn)
  const [wakeOn, setWakeOn] = useState(() => getSettings().wakeOn)
  const [ttsOnline, setTtsOnline] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    ttsAvailable().then(setTtsOnline)
  }, [])

  // greet the first time the console becomes visible — via wake word or manual open
  useEffect(() => {
    if (hidden || greetedRef.current || !ttsOnline) return
    greetedRef.current = true
    if (!voiceOn) return
    forceAudioUnlock() // an active mic capture grants autoplay even without a click
    whenAudioReady(() => {
      onStateChange('talking')
      speak(greeting).finally(() => onStateChange('breathing'))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, ttsOnline])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim()
    if (!text || busy) return
    setInput('')

    const base: Message[] = [...messages, { role: 'user', text }]

    // fixed identity answer — no model round-trip
    if (IDENTITY_RE.test(text)) {
      setMessages([...base, { role: 'jarvis', text: IDENTITY_REPLY }])
      if (voiceOn && ttsOnline) {
        onStateChange('talking')
        speak(IDENTITY_REPLY).finally(() => onStateChange('breathing'))
      }
      return
    }

    setMessages([...base, { role: 'jarvis', text: '…' }])

    if (!activeReady) {
      setMessages([...base, { role: 'jarvis', text: `No API key available — add one to frontend/.env and restart.` }])
      return
    }

    // resolve which brain answers this message, with automatic failover
    const primary = mode === 'auto' ? pickProvider(text) : pinned ?? PROVIDERS[0]
    const candidates = [primary, ...PROVIDERS.filter((p) => p.id !== primary.id && providerAvailable(p))]

    setBusy(true)
    onStateChange('solving')
    stopSpeaking() // interrupt any ongoing speech for the new exchange
    let acc = ''
    let sentUpTo = 0 // how much of the cleaned text has been queued for speech
    const speakLive = voiceOn && ttsOnline
    try {
      const history: ChatMessage[] = base.map((m) => ({
        role: m.role === 'jarvis' ? 'assistant' : 'user',
        content: m.text,
      }))
      let lastError: unknown = null
      for (const provider of candidates) {
        acc = ''
        sentUpTo = 0
        setLastUsed(provider)
        try {
          await runChat({
            provider,
            history,
            onDelta: (chunk) => {
              acc += chunk
              const cleaned = stripToolLeakage(acc)
              setMessages([...base, { role: 'jarvis', text: cleaned || '…' }])
              // speak each sentence the moment it completes, parallel to the stream
              if (speakLive) {
                let lastEnd = -1
                const re = /[.!?](?=\s|$)/g
                let m: RegExpExecArray | null
                while ((m = re.exec(cleaned))) lastEnd = m.index
                if (lastEnd >= sentUpTo) {
                  const sentence = cleaned.slice(sentUpTo, lastEnd + 1).trim()
                  if (sentence) enqueueSpeech(sentence)
                  sentUpTo = lastEnd + 1
                }
              }
            },
            executeTool: executeUICommand,
          })
          if (!stripToolLeakage(acc).trim()) {
            // silent rate-limit: 200 with an empty stream — try the next brain
            lastError = new Error(`${provider.label} returned an empty response (rate limited?)`)
            continue
          }
          lastError = null
          break // success — no failover needed
        } catch (err) {
          lastError = err
          stopSpeaking() // discard any partial speech before retrying on the next brain
        }
      }
      if (lastError) throw lastError
    } catch (err) {
      setMessages([...base, { role: 'jarvis', text: `Uplink error: ${err instanceof Error ? err.message : err}` }])
    } finally {
      // re-enable input as soon as the text reply is done — voice plays independently
      setBusy(false)
    }

    const cleaned = stripToolLeakage(acc)
    if (cleaned !== acc) setMessages([...base, { role: 'jarvis', text: cleaned || 'Acknowledged, sir.' }])
    if (cleaned) appendChatLog(text, cleaned) // MEMORY module: remember the exchange

    if (speakLive) {
      const leftover = cleaned.slice(sentUpTo).trim()
      if (leftover) enqueueSpeech(leftover)
      if (sentUpTo > 0 || leftover) {
        onStateChange('talking')
        void waitForSpeechIdle().then(() => onStateChange('breathing'))
        return
      }
    }
    onStateChange('breathing')
  }

  const { listening, interim, error: speechError, start, stop } = useSpeech({
    onFinal: (text) => send(text),
    onEnd: (hadFinal) => {
      if (!hadFinal) onStateChange('breathing')
    },
  })

  useEffect(() => {
    if (speechError) {
      setMessages((m) => [...m, { role: 'jarvis', text: speechError }])
    }
  }, [speechError])

  const micClick = () => {
    if (!speechSupported) {
      setMessages((m) => [...m, { role: 'jarvis', text: 'Voice input requires Chrome or Edge (Web Speech API).' }])
      return
    }
    if (listening) {
      stop()
    } else {
      start()
      onStateChange('listening')
    }
  }

  // "hey Jarvis" — pops the console open, greets on first contact, runs trailing commands
  useWakeWord({
    enabled: wakeOn && speechSupported && !listening && !busy,
    onWake: (command) => {
      stopSpeaking()
      forceAudioUnlock()
      if (hidden) onRequestOpen()
      if (command) {
        greetedRef.current = true // don't talk over the answer
        void send(command)
      } else if (greetedRef.current) {
        // browser only: the wake recognizer may still be releasing the mic
        window.setTimeout(() => {
          start()
          onStateChange('listening')
        }, isDesktop() ? 0 : 350)
      }
      // bare wake before the first greeting: the visibility effect greets as it opens
    },
    onBlocked: (reason, persist) => {
      setWakeOn(false)
      if (persist) setSetting('wakeOn', false)
      setMessages((m) => [...m, { role: 'jarvis', text: reason }])
    },
  })

  return (
    <aside className={`console cut${hidden ? ' console-hidden' : ''}`} ref={rootRef}>
      <div className="console-header">
        <span className="console-title">
          <span className={`console-led${activeReady ? ' on' : ''}`} />
          NEURAL LINK
        </span>
        <span className="console-header-right">
          <button
            type="button"
            className={`console-voice${wakeOn ? ' on' : ''}`}
            title={wakeOn ? 'Wake word ON — say "hey Jarvis"' : 'Wake word off'}
            onClick={() => {
              const next = !wakeOn
              setWakeOn(next)
              setSetting('wakeOn', next)
            }}
          >
            ⌾
          </button>
          <button
            type="button"
            className={`console-voice${voiceOn && ttsOnline ? ' on' : ''}`}
            title={ttsOnline ? (voiceOn ? 'Voice output on' : 'Voice output muted') : 'Voice server offline'}
            onClick={() => {
              stopSpeaking()
              setVoiceOn((v) => !v)
            }}
          >
            <SpeakerIcon muted={!(voiceOn && ttsOnline)} />
          </button>
          <button type="button" className="console-collapse" title="Collapse console" onClick={onCollapse}>
            <ChevronIcon />
          </button>
        </span>
      </div>
      <div className="console-meta-line">
        <div className="model-picker">
          <button
            type="button"
            className={`model-btn${modelOpen ? ' open' : ''}`}
            onClick={() => setModelOpen((v) => !v)}
            title="Switch model"
          >
            {modelLabel} ▾
          </button>
          {modelOpen && (
            <div className="model-menu">
              <button
                type="button"
                className={`model-option${mode === 'auto' ? ' active' : ''}${anyKeyPresent ? '' : ' locked'}`}
                disabled={!anyKeyPresent}
                onClick={() => {
                  setMode('auto')
                  setModelOpen(false)
                }}
              >
                ⚡ Auto · smart routing
              </button>
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`model-option${p.id === mode ? ' active' : ''}${providerAvailable(p) ? '' : ' locked'}`}
                  disabled={!providerAvailable(p)}
                  onClick={() => {
                    setMode(p.id)
                    setModelOpen(false)
                  }}
                >
                  {p.label}{providerAvailable(p) ? '' : ' · no key'}
                </button>
              ))}
            </div>
          )}
        </div>
        <span>
          STREAM · <em className={busy ? 'live' : ''}>{busy ? 'STREAMING' : 'IDLE'}</em>
        </span>
      </div>
      <div className="console-chips">
        <button
          type="button"
          className="console-chip"
          onClick={() => onOpenBrowser('https://www.youtube.com/embed/videoseries?list=UUsooa4yRKGN_zEE8iknghZA')}
        >
          ⚡ Open YouTube in embedded browser
        </button>
        <button
          type="button"
          className="console-chip"
          onClick={() =>
            setMessages((m) => [
              ...m,
              { role: 'jarvis', text: `Telemetry nominal. Render loop stable, state protocol "${state}" engaged.` },
            ])
          }
        >
          ⚡ Check system telemetry
        </button>
      </div>
      <div className="console-messages" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`console-msg ${m.role}`}>
            {m.role === 'jarvis' && (
              <span className="console-msg-orb">
                <ThinkingOrb state={orbState} size={20} theme="dark" style={orangeTint} />
              </span>
            )}
            {m.text === '…' ? (
              <p className="typing-dots" aria-label="Jarvis is thinking">
                <span>●</span>
                <span>●</span>
                <span>●</span>
              </p>
            ) : (
              <p>{m.text}</p>
            )}
          </div>
        ))}
      </div>
      <VoiceWave />
      <div className="console-input-row">
        <button
          type="button"
          className={`console-mic${listening ? ' listening' : ''}`}
          onClick={micClick}
          title={listening ? 'Stop listening' : 'Speak to Jarvis'}
        >
          ◉
        </button>
        <input
          className="console-input"
          placeholder={listening ? 'Listening…' : busy ? 'Processing…' : 'Enter your command…'}
          value={listening && interim ? interim : input}
          disabled={busy}
          readOnly={listening}
          onFocus={() => !listening && onStateChange('composing')}
          onBlur={() => !busy && !listening && onStateChange('breathing')}
          onChange={(e) => {
            setInput(e.target.value)
            onStateChange('composing')
          }}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button
          type="button"
          className={`console-send${input.trim() && !busy ? ' ready' : ''}`}
          onClick={() => send()}
          disabled={busy}
        >
          ➤
        </button>
      </div>
      <div className="console-footer">
        <span>⛨ SECURE CHANNEL</span>
        <span>256-BIT ENCRYPTION</span>
      </div>
    </aside>
  )
}
