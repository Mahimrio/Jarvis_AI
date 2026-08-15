import { useEffect, useRef, useState } from 'react'
import { isSpeaking } from './tts'

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

export const speechSupported = typeof SpeechRecognitionCtor === 'function'

interface Options {
  onFinal: (text: string) => void
  onEnd: (hadFinal: boolean) => void
}

export function useSpeech({ onFinal, onEnd }: Options) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const hadFinal = useRef(false)
  const cbRef = useRef({ onFinal, onEnd })
  cbRef.current = { onFinal, onEnd }

  useEffect(() => () => recRef.current?.abort(), [])

  const start = () => {
    if (!speechSupported || listening) return
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
    rec.start()
    setListening(true)
  }

  const stop = () => recRef.current?.stop()

  return { listening, interim, error, start, stop }
}

const WAKE_RE = /\b(?:hey|hi|ok|okay)?[,.\s]*jarvis\b[,.!?]*\s*(.*)$/i

interface WakeOptions {
  enabled: boolean
  // command = words spoken after "jarvis" in the same breath, if any
  onWake: (command: string | null) => void
  onBlocked?: (reason: string) => void
}

// always-on background listener for "hey Jarvis" (Web Speech, Chrome/Edge)
export function useWakeWord({ enabled, onWake, onBlocked }: WakeOptions) {
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const cbRef = useRef({ onWake, onBlocked })
  cbRef.current = { onWake, onBlocked }
  const lastFire = useRef(0)
  const blocked = useRef(false)

  useEffect(() => {
    if (!enabled || !speechSupported || blocked.current) return
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
          cbRef.current.onBlocked?.('Microphone access denied — wake word disabled.')
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
