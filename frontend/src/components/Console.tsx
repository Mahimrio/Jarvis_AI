import { useEffect, useRef, useState } from 'react'
import { ThinkingOrb } from 'thinking-orbs'
import type { OrbState } from './states'
import { chatStream, hasKey, type ChatMessage } from '../lib/groq'
import { speechSupported, useSpeech } from '../lib/speech'
import { speak, stopSpeaking, ttsAvailable } from '../lib/tts'

const orangeTint = {
  filter: 'sepia(1) saturate(4) hue-rotate(-15deg) brightness(1.15)',
}

interface Message {
  role: 'jarvis' | 'user'
  text: string
}

interface Props {
  state: OrbState
  onOpenBrowser: (url: string) => void
  onStateChange: (s: OrbState) => void
}

export default function Console({ state, onOpenBrowser, onStateChange }: Props) {
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
      for await (const chunk of chatStream(history)) {
        acc += chunk
        setMessages([...base, { role: 'jarvis', text: acc }])
      }
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
    <aside className="console cut">
      <div className="console-header">
        <span className="console-title">⚡ NEURAL INTERACTION CONSOLE</span>
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
            {voiceOn && ttsOnline ? '🔊' : '🔇'}
          </button>
          <span className="console-status">{hasKey ? 'GROQ LPU ONLINE' : 'NO API KEY'}</span>
        </span>
      </div>
      <div className="console-meta">
        <span className="console-meta-chip cut">
          <em>MODEL</em>LLAMA 3.3
        </span>
        <span className="console-meta-chip cut">
          <em>MODE</em>STREAM
        </span>
        <span className="console-meta-chip cut">
          <em>RESPONSE</em>
          {busy ? 'STREAMING' : 'LIVE'}
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
            <p>{m.text}</p>
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
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button type="button" className="console-send" onClick={() => send()} disabled={busy}>
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
