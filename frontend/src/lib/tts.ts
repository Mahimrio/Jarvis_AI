const TTS_URL = 'http://localhost:8765'

let current: HTMLAudioElement | null = null
let activeGeneration = 0
let queue: Promise<string>[] = []
let pumping = false
let idleResolvers: (() => void)[] = []

// browsers block audio until the first user gesture — run queued callbacks then
let audioUnlocked = false
const readyCallbacks: (() => void)[] = []
function unlockAudio() {
  if (audioUnlocked) return
  audioUnlocked = true
  window.removeEventListener('pointerdown', unlockAudio)
  window.removeEventListener('keydown', unlockAudio)
  initAnalyser() // must happen inside a real user gesture
  readyCallbacks.splice(0).forEach((cb) => cb())
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockAudio)
  window.addEventListener('keydown', unlockAudio)
}

export function whenAudioReady(cb: () => void) {
  if (audioUnlocked) cb()
  else readyCallbacks.push(cb)
}

// ---- live voice amplitude (drives the talking-state visualizer) ----
let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let levelData: Uint8Array | null = null

function initAnalyser() {
  try {
    audioCtx = new AudioContext()
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.55
    analyser.connect(audioCtx.destination)
    levelData = new Uint8Array(analyser.frequencyBinCount)
    // fire-and-forget: NEVER await resume(), it can hang forever
    if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {})
  } catch {
    audioCtx = null
    analyser = null
  }
}

function wireAnalyser(audio: HTMLAudioElement) {
  // only reroute through the context when it is actually running,
  // otherwise a suspended context would silence the element entirely
  if (!audioCtx || !analyser || audioCtx.state !== 'running') return
  try {
    audioCtx.createMediaElementSource(audio).connect(analyser)
  } catch {
    /* element keeps playing directly */
  }
}

// 0..1 — how loud Jarvis is speaking right now
export function getVoiceLevel(): number {
  if (!analyser || !levelData || !current) return 0
  analyser.getByteFrequencyData(levelData)
  let sum = 0
  for (let i = 0; i < levelData.length; i++) sum += levelData[i]
  return Math.min(1, sum / levelData.length / 85)
}

export function isSpeaking(): boolean {
  return current !== null || pumping || queue.length > 0
}

export async function ttsAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${TTS_URL}/health`)
    return (await res.json()).model_loaded === true
  } catch {
    return false
  }
}

function resolveIdle() {
  idleResolvers.splice(0).forEach((r) => r())
}

export function stopSpeaking() {
  activeGeneration++
  queue = []
  if (current) {
    current.pause()
    current.src = ''
    current = null
  }
  resolveIdle()
}

async function fetchWavUrl(text: string): Promise<string> {
  const res = await fetch(`${TTS_URL}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(`TTS server responded ${res.status}`)
  return URL.createObjectURL(await res.blob())
}

function playUrl(url: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url)
    current = audio
    wireAnalyser(audio)
    const finish = () => {
      if (current === audio) current = null
      resolve()
    }
    audio.onended = finish
    audio.onerror = finish
    audio.onpause = finish
    audio.play().catch(finish)
  })
}

async function pump(gen: number) {
  if (pumping) return
  pumping = true
  try {
    while (queue.length > 0 && gen === activeGeneration) {
      const next = queue.shift()!
      let url: string
      try {
        url = await next
      } catch {
        continue
      }
      if (gen !== activeGeneration) {
        URL.revokeObjectURL(url)
        break
      }
      await playUrl(url)
      URL.revokeObjectURL(url)
    }
  } finally {
    pumping = false
    if (queue.length === 0) resolveIdle()
  }
}

// queue a sentence: its audio is fetched immediately (prefetch), played in order
export function enqueueSpeech(text: string) {
  const t = text.trim()
  if (!t) return
  queue.push(fetchWavUrl(t))
  void pump(activeGeneration)
}

export function waitForSpeechIdle(): Promise<void> {
  if (!pumping && queue.length === 0) return Promise.resolve()
  return new Promise((res) => idleResolvers.push(res))
}

export async function speak(text: string): Promise<void> {
  stopSpeaking()
  enqueueSpeech(text)
  return waitForSpeechIdle()
}
