// offline speech for the desktop shell: openWakeWord hotword stream +
// whole-utterance whisper transcription (Chrome's speech service doesn't exist in Electron)
import { isSpeaking } from './tts'

export interface NativeSttSession {
  stop: () => void
}

interface MicPipeline {
  close: () => void
}

// shared mic capture: 16kHz mono int16 frames with gain + adaptive normalization.
// The wake detector needs clean (unclipped) audio, so it opts out of the boost chain.
async function openMic(
  onFrame: (pcm: Int16Array) => void,
  onError?: (msg: string) => void,
  opts?: { gain?: number; adaptive?: boolean },
): Promise<MicPipeline | null> {
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // noiseSuppression gates quiet voices — our own gain chain handles levels
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: true },
    })
  } catch {
    onError?.('Microphone unavailable — check the Windows default input device.')
    return null
  }

  const ctx = new AudioContext({ sampleRate: 16000 })
  const source = ctx.createMediaStreamSource(stream)
  const gain = ctx.createGain()
  gain.gain.value = opts?.gain ?? 4.0
  const adaptive = opts?.adaptive ?? true
  const proc = ctx.createScriptProcessor(4096, 1, 1)

  let closed = false
  let ema = 0.05
  proc.onaudioprocess = (e) => {
    if (closed) return
    const f32 = e.inputBuffer.getChannelData(0)
    let sum = 0
    for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i]
    const rms = Math.sqrt(sum / f32.length)
    if (rms > 0.004) ema = ema * 0.85 + rms * 0.15
    const boost = adaptive ? Math.min(12, Math.max(1, 0.25 / Math.max(ema, 0.008))) : 1
    const i16 = new Int16Array(f32.length)
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i] * boost))
      i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    onFrame(i16)
  }

  source.connect(gain)
  gain.connect(proc)
  proc.connect(ctx.destination) // required for onaudioprocess to fire

  return {
    close: () => {
      if (closed) return
      closed = true
      try {
        proc.disconnect()
        gain.disconnect()
        source.disconnect()
      } catch {
        /* already torn down */
      }
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close().catch(() => {})
    },
  }
}

interface WakeOptions {
  onWake: () => void
  onError?: (message: string) => void
}

// always-on hotword stream against the backend's openWakeWord detector
export async function startWakeStream({ onWake, onError }: WakeOptions): Promise<NativeSttSession> {
  const ws = new WebSocket('ws://localhost:8765/wake/ws')
  ws.binaryType = 'arraybuffer'
  let mic: MicPipeline | null = null
  let stopped = false

  const stop = () => {
    if (stopped) return
    stopped = true
    mic?.close()
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
  }

  ws.onmessage = (e) => {
    try {
      if (JSON.parse(e.data as string).type === 'wake') onWake()
    } catch {
      /* ignore */
    }
  }
  ws.onerror = () => {
    onError?.('wake stream unavailable')
    stop()
  }
  ws.onclose = () => {
    if (!stopped) {
      onError?.('wake stream closed')
      stop()
    }
  }
  ws.onopen = async () => {
    // mild fixed gain, no adaptive boost: openWakeWord fails on clipped audio
    mic = await openMic(
      (pcm) => {
        if (!stopped && ws.readyState === WebSocket.OPEN && !isSpeaking()) ws.send(pcm.buffer as ArrayBuffer)
      },
      onError,
      { gain: 2.0, adaptive: false },
    )
    if (!mic || stopped) stop()
  }

  return { stop }
}

interface RecordOptions {
  onDone: (text: string) => void
  onError?: (message: string) => void
  onLevel?: (active: boolean) => void
  maxMs?: number
}

export interface RecordSession {
  finish: () => void
  cancel: () => void
}

// record one utterance (voice-activity stop) then transcribe it with whisper
export async function recordUtterance({ onDone, onError, onLevel, maxMs = 12000 }: RecordOptions): Promise<RecordSession> {
  const chunks: Int16Array[] = []
  let speechStarted = false
  let silentMs = 0
  let done = false
  let mic: MicPipeline | null = null
  let maxTimer: number | undefined

  const finalize = async (transcribe: boolean) => {
    if (done) return
    done = true
    clearTimeout(maxTimer)
    mic?.close()
    if (!transcribe) return
    const total = chunks.reduce((n, c) => n + c.length, 0)
    if (total < 4000) {
      onDone('')
      return
    }
    const pcm = new Int16Array(total)
    let off = 0
    for (const c of chunks) {
      pcm.set(c, off)
      off += c.length
    }
    try {
      const res = await fetch('http://localhost:8765/stt/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: pcm.buffer,
      })
      if (!res.ok) throw new Error(`transcribe ${res.status}`)
      onDone(((await res.json()).text ?? '').trim())
    } catch {
      onError?.('Transcription failed — is the voice server running?')
      onDone('')
    }
  }

  mic = await openMic((pcm) => {
    if (done) return
    let sum = 0
    for (let i = 0; i < pcm.length; i++) {
      const f = pcm[i] / 32768
      sum += f * f
    }
    const rms = Math.sqrt(sum / pcm.length)
    const frameMs = (pcm.length / 16000) * 1000
    if (!speechStarted) {
      // rolling pre-roll: keep only ~0.5s before speech begins (less silence to transcribe)
      chunks.push(pcm)
      if (chunks.length > 2) chunks.shift()
    } else {
      chunks.push(pcm)
    }
    if (rms > 0.035) {
      speechStarted = true
      silentMs = 0
      onLevel?.(true)
    } else if (speechStarted) {
      silentMs += frameMs
      onLevel?.(false)
      if (silentMs > 1000) void finalize(true) // sentence finished
    }
  }, onError)

  if (!mic) {
    done = true
    onDone('')
    return { finish: () => {}, cancel: () => {} }
  }
  maxTimer = window.setTimeout(() => void finalize(true), maxMs)

  return {
    finish: () => void finalize(true),
    cancel: () => void finalize(false),
  }
}
