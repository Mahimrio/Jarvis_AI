import { useEffect, useRef, useState } from 'react'
import { isSpeaking } from './tts'
import { isDesktop } from './os'
import { startWakeStream, recordUtterance, type NativeSttSession, type RecordSession } from './nativeStt'

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}

const SpeechRecognitionCtor = (window as unknown as Record<string, unknown>).SpeechRecognition ??
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition

// browser uses Web Speech; the desktop shell uses the backend's offline vosk engine
export const speechSupported = typeof SpeechRecognitionCtor === 'function' || isDesktop()

interface Options {
  onFinal: (text: string) => void
  onEnd: (hadFinal: boolean) => void
}

export function useSpeech({ onFinal, onEnd }: Options) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const nativeRef = useRef<RecordSession | null>(null)
  const hadFinal = useRef(false)
  const cbRef = useRef({ onFinal, onEnd })
  cbRef.current = { onFinal, onEnd }

  useEffect(
    () => () => {
      recRef.current?.abort()
      nativeRef.current?.cancel()
    },
    [],
  )

  const startNative = async () => {
    setError(null)
    hadFinal.current = false
    setListening(true)
    setInterim('Listening… speak now')
    nativeRef.current = await recordUtterance({
      onLevel: (active) => {
        if (active) setInterim('Listening…')
      },
      onDone: (text) => {
        nativeRef.current = null
        setListening(false)
        setInterim('')
        if (text) {
          hadFinal.current = true
          cbRef.current.onFinal(text)
        }
        cbRef.current.onEnd(hadFinal.current)
      },
      onError: (msg) => setError(msg),
    })
  }

  const start = () => {
    if (listening) return
    if (isDesktop()) {
      void startNative()
      return
    }
    if (typeof SpeechRecognitionCtor !== 'function') return
    setError(null)
    hadFinal.current = false
    const rec = new (SpeechRecognitionCtor as new () => SpeechRecognitionLike)()
    rec.lang = 'en-US'
    rec.continuous = false
    rec.interimResults = true
    rec.onresult = (e) => {
      let interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) {
          hadFinal.current = true
          cbRef.current.onFinal(res[0].transcript.trim())
        } else {
          interimText += res[0].transcript
        }
      }
      setInterim(interimText)
    }
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return // benign: silence or manual stop
      setError(
        e.error === 'not-allowed'
          ? 'Microphone access denied — allow mic permission for this site.'
          : e.error === 'audio-capture'
            ? 'No microphone found — check that a mic is connected and set as the Windows default input.'
            : e.error === 'network'
              ? 'Speech service unreachable — voice input needs Chrome/Edge with internet.'
              : `Speech error: ${e.error}`
      )
    }
    rec.onend = () => {
      setListening(false)
      setInterim('')
      cbRef.current.onEnd(hadFinal.current)
    }
    recRef.current = rec
    // another session may still be shutting down (wake handoff) — retry once
    try {
      rec.start()
    } catch {
      window.setTimeout(() => {
        try {
          rec.start()
        } catch {
          setError('Voice input busy — try again.')
          setListening(false)
          return
        }
      }, 350)
    }
    setListening(true)
  }

  const stop = () => {
    recRef.current?.stop()
    if (nativeRef.current) {
      nativeRef.current.finish() // transcribe what was captured so far
    }
  }

  return { listening, interim, error, start, stop }
}

const WAKE_RE = /\b(?:hey|hi|ok|okay)?[,.\s]*jarvis\b[,.!?]*\s*(.*)$/i

interface WakeOptions {
  enabled: boolean
  // command = words spoken after "jarvis" in the same breath, if any
  onWake: (command: string | null) => void
  onBlocked?: (reason: string, persist: boolean) => void
}

// always-on background listener for "hey Jarvis" (Web Speech in browser, vosk on desktop)
export function useWakeWord({ enabled, onWake, onBlocked }: WakeOptions) {
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const cbRef = useRef({ onWake, onBlocked })
  cbRef.current = { onWake, onBlocked }
  const lastFire = useRef(0)
  const blocked = useRef(false)
  const netFails = useRef(0)

  // desktop: dedicated openWakeWord hotword stream (auto-reconnects if the backend restarts)
  useEffect(() => {
    if (!enabled || !isDesktop() || blocked.current) return
    let disposed = false
    let session: NativeSttSession | null = null
    let retryTimer: number | undefined

    const spin = async () => {
      if (disposed) return
      session = await startWakeStream({
        onWake: () => {
          if (isSpeaking()) return
          if (Date.now() - lastFire.current < 1500) return
          lastFire.current = Date.now()
          // keep the stream alive — it tears down via the `enabled` flag while listening
          cbRef.current.onWake(null)
        },
        onError: () => {
          if (!disposed) retryTimer = window.setTimeout(spin, 4000)
        },
      })
      if (disposed) session.stop()
    }

    void spin()
    return () => {
      disposed = true
      clearTimeout(retryTimer)
      session?.stop()
    }
  }, [enabled])

  // browser: Chrome/Edge Web Speech
  useEffect(() => {
    if (!enabled || isDesktop() || typeof SpeechRecognitionCtor !== 'function' || blocked.current) return
    let disposed = false
    let rec: SpeechRecognitionLike | null = null
    let restartTimer: number | undefined

    const spin = () => {
      if (disposed || blocked.current) return
      rec = new (SpeechRecognitionCtor as new () => SpeechRecognitionLike)()
      rec.lang = 'en-US'
      rec.continuous = true
      rec.interimResults = true
      rec.onresult = (e) => {
        netFails.current = 0
        if (isSpeaking()) return // never let Jarvis wake himself
        if (Date.now() - lastFire.current < 1500) return
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i]
          const m = WAKE_RE.exec(res[0].transcript)
          if (!m) continue
          const trailing = (m[1] ?? '').trim()
          // fire immediately on a bare wake word; wait for the final result
          // when the command rides in the same utterance
          if (res.isFinal || trailing.length === 0) {
            lastFire.current = Date.now()
            rec?.abort()
            cbRef.current.onWake(trailing.length > 1 ? trailing : null)
            return
          }
        }
      }
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          blocked.current = true
          cbRef.current.onBlocked?.('Microphone access denied — wake word disabled.', true)
        }
        // no speech service in this environment (e.g. Electron) — stop the retry loop
        if (e.error === 'network' && ++netFails.current >= 3) {
          blocked.current = true
          cbRef.current.onBlocked?.(
            'Speech service unavailable in this environment — wake word paused.',
            false
          )
        }
      }
      rec.onend = () => {
        // Chrome ends continuous sessions after silence — quietly respin
        if (!disposed && !blocked.current) restartTimer = window.setTimeout(spin, 400)
      }
      try {
        rec.start()
      } catch {
        restartTimer = window.setTimeout(spin, 1000)
      }
      recRef.current = rec
    }

    spin()
    return () => {
      disposed = true
      clearTimeout(restartTimer)
      rec?.abort()
      recRef.current = null
    }
  }, [enabled])
}
