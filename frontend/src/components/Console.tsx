import { useEffect, useRef, useState } from 'react'
import { ThinkingOrb } from 'thinking-orbs'
import gsap from 'gsap'
import type { OrbState } from './states'
import { runChat, hasKey, type ChatMessage, type ToolExecutor } from '../lib/groq'
import { speechSupported, useSpeech } from '../lib/speech'
import { speak, stopSpeaking, ttsAvailable } from '../lib/tts'

const orangeTint = {
  filter: 'sepia(1) saturate(4) hue-rotate(-15deg) brightness(1.15)',
}

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

interface Message {
  role: 'jarvis' | 'user'
  text: string
}

interface Props {
  state: OrbState
  onOpenBrowser: (url: string) => void
  onStateChange: (s: OrbState) => void
  executeUICommand: ToolExecutor
  onCollapse: () => void
}

export default function Console({ state, onOpenBrowser, onStateChange, executeUICommand, onCollapse }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'jarvis',
      text: hasKey
        ? 'Systems online. Groq uplink established — how can I assist?'
        : 'Systems online, but no Groq key detected. Paste your key into frontend/.env (VITE_GROQ_API_KEY) and restart the dev server.',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [voiceOn, setVoiceOn] = useState(true)
  const [ttsOnline, setTtsOnline] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const tween = gsap.from(rootRef.current, { x: 72, opacity: 0, duration: 0.5, ease: 'power3.out' })
    return () => {
      tween.revert()
    }
  }, [])

  const collapse = () => {
    gsap.to(rootRef.current, {
      x: '112%',
      opacity: 0.4,
      duration: 0.4,
      ease: 'power3.in',
      onComplete: onCollapse,
    })
  }

  useEffect(() => {
    ttsAvailable().then(setTtsOnline)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim()
    if (!text || busy) return
    setInput('')

    const base: Message[] = [...messages, { role: 'user', text }]
    setMessages([...base, { role: 'jarvis', text: '…' }])

    if (!hasKey) {
      setMessages([...base, { role: 'jarvis', text: 'No Groq key configured — add VITE_GROQ_API_KEY to frontend/.env and restart.' }])
      return
    }

    setBusy(true)
    onStateChange('working')
    try {
      const history: ChatMessage[] = base.map((m) => ({
        role: m.role === 'jarvis' ? 'assistant' : 'user',
        content: m.text,
      }))
      let acc = ''
      await runChat({
        history,
        onDelta: (chunk) => {
          acc += chunk
          setMessages([...base, { role: 'jarvis', text: acc }])
        },
        executeTool: executeUICommand,
      })
      if (voiceOn && ttsOnline && acc) {
        onStateChange('composing')
        await speak(acc)
      }
    } catch (err) {
      setMessages([...base, { role: 'jarvis', text: `Uplink error: ${err instanceof Error ? err.message : err}` }])
    } finally {
      setBusy(false)
      onStateChange('breathing')
    }
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

  return (
    <aside className="console cut" ref={rootRef}>
      <div className="console-header">
        <span className="console-title">
          <span className={`console-led${hasKey ? ' on' : ''}`} />
          NEURAL LINK
        </span>
        <span className="console-header-right">
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
          <button type="button" className="console-collapse" title="Collapse console" onClick={collapse}>
            <ChevronIcon />
          </button>
        </span>
      </div>
      <div className="console-meta-line">
        <span>{hasKey ? 'GROQ LPU · ONLINE' : 'NO API KEY'}</span>
        <span>
          LLAMA 3.3 · STREAM · <em className={busy ? 'live' : ''}>{busy ? 'STREAMING' : 'IDLE'}</em>
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
                <ThinkingOrb state={state} size={20} theme="dark" style={orangeTint} />
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
