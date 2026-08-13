const TTS_URL = 'http://localhost:8765'

let ctx: AudioContext | null = null
let activeGeneration = 0

export async function ttsAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${TTS_URL}/health`)
    return (await res.json()).model_loaded === true
  } catch {
    return false
  }
}

export function stopSpeaking() {
  activeGeneration++
  ctx?.close().catch(() => {})
  ctx = null
}

// streams PCM chunks from the server and plays them as they arrive
export async function speak(text: string): Promise<void> {
  stopSpeaking()
  const generation = activeGeneration

  const res = await fetch(`${TTS_URL}/tts/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok || !res.body) throw new Error(`TTS server responded ${res.status}`)
  const sampleRate = Number(res.headers.get('X-Sample-Rate') ?? 24000)

  ctx = new AudioContext({ sampleRate })
  const localCtx = ctx
  let playHead = localCtx.currentTime + 0.08
  let leftover = new Uint8Array(0)
  const reader = res.body.getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (generation !== activeGeneration) {
      reader.cancel().catch(() => {})
      return
    }
    if (done) break
    if (!value || value.length === 0) continue

    // stitch onto any leftover odd byte from the previous chunk
    const bytes = new Uint8Array(leftover.length + value.length)
    bytes.set(leftover)
    bytes.set(value, leftover.length)
    const usable = bytes.length - (bytes.length % 2)
    leftover = bytes.slice(usable)

    const samples = new Int16Array(bytes.buffer.slice(0, usable))
    if (samples.length === 0) continue
    const floats = new Float32Array(samples.length)
    for (let i = 0; i < samples.length; i++) floats[i] = samples[i] / 32768

    const buffer = localCtx.createBuffer(1, floats.length, sampleRate)
    buffer.copyToChannel(floats, 0)
    const src = localCtx.createBufferSource()
    src.buffer = buffer
    src.connect(localCtx.destination)
    if (playHead < localCtx.currentTime) playHead = localCtx.currentTime + 0.02
    src.start(playHead)
    playHead += buffer.duration
  }

  // wait until scheduled audio finishes
  const remaining = playHead - localCtx.currentTime
  if (remaining > 0) {
    await new Promise<void>((resolve) => {
      const id = setInterval(() => {
        if (generation !== activeGeneration || localCtx.currentTime >= playHead - 0.05) {
          clearInterval(id)
          resolve()
        }
      }, 100)
    })
  }
  if (generation === activeGeneration) {
    localCtx.close().catch(() => {})
    if (ctx === localCtx) ctx = null
  }
}
