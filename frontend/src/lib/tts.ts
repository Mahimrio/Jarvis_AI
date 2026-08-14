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
