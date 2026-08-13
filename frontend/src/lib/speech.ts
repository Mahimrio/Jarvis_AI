import { useEffect, useRef, useState } from 'react'

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
      setError(
        e.error === 'not-allowed'
          ? 'Microphone access denied — allow mic permission for this site.'
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
