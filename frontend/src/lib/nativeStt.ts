// offline speech-to-text for the desktop shell: streams mic PCM to the
// backend's vosk WebSocket (Chrome's speech service doesn't exist in Electron)

export interface NativeSttSession {
  stop: () => void
}

interface Options {
  onPartial?: (text: string) => void
  onFinal: (text: string) => void
  onError?: (message: string) => void
}

export async function startNativeStt({ onPartial, onFinal, onError }: Options): Promise<NativeSttSession> {
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  } catch {
    onError?.('Microphone unavailable — check the Windows default input device.')
    return { stop: () => {} }
  }

  const ws = new WebSocket('ws://localhost:8765/stt/ws')
  ws.binaryType = 'arraybuffer'

  const ctx = new AudioContext({ sampleRate: 16000 })
  const source = ctx.createMediaStreamSource(stream)
  // base amplification — quiet mics drown in the recognizer otherwise
  const gain = ctx.createGain()
  gain.gain.value = 2.5
  // ScriptProcessor: simple, reliable PCM tap (worklet is overkill for 16kHz mono)
  const proc = ctx.createScriptProcessor(4096, 1, 1)

  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    try {
      proc.disconnect()
      gain.disconnect()
      source.disconnect()
    } catch {
      /* already torn down */
    }
    stream.getTracks().forEach((t) => t.stop())
    void ctx.close().catch(() => {})
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
  }

  // adaptive normalization: track speech level, lift quiet voices toward a healthy range
  let ema = 0.05
  proc.onaudioprocess = (e) => {
    if (stopped || ws.readyState !== WebSocket.OPEN) return
    const f32 = e.inputBuffer.getChannelData(0)
    let sum = 0
    for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i]
    const rms = Math.sqrt(sum / f32.length)
    if (rms > 0.005) ema = ema * 0.85 + rms * 0.15 // only adapt while there is signal
    const boost = Math.min(6, Math.max(1, 0.18 / Math.max(ema, 0.01)))
    const i16 = new Int16Array(f32.length)
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i] * boost))
      i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    ws.send(i16.buffer)
  }

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data as string)
      if (msg.type === 'final' && msg.text) onFinal(msg.text)
      else if (msg.type === 'partial' && msg.text) onPartial?.(msg.text)
    } catch {
      /* ignore malformed frames */
    }
  }
  ws.onerror = () => {
    onError?.('Speech engine offline — is the voice server running?')
    stop()
  }
  ws.onopen = () => {
    source.connect(gain)
    gain.connect(proc)
    proc.connect(ctx.destination) // required for onaudioprocess to fire
  }

  return { stop }
}
