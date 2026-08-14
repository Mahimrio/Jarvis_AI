const TTS_URL = 'http://localhost:8765'

let current: HTMLAudioElement | null = null
let activeGeneration = 0

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

export function stopSpeaking() {
  activeGeneration++
  if (current) {
    current.pause()
    current.src = ''
    current = null
  }
}

// fetches the full WAV and plays it via an audio element (reliable everywhere)
export async function speak(text: string): Promise<void> {
  stopSpeaking()
  const generation = activeGeneration

  const res = await fetch(`${TTS_URL}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(`TTS server responded ${res.status}`)
  const url = URL.createObjectURL(await res.blob())
  if (generation !== activeGeneration) {
    URL.revokeObjectURL(url)
    return
  }

  const audio = new Audio(url)
  audio.volume = 1
  current = audio
  await new Promise<void>((resolve) => {
    const finish = () => resolve()
    audio.onended = finish
    audio.onerror = finish
    audio.onpause = finish
    audio.play().catch(finish)
  })
  URL.revokeObjectURL(url)
  if (current === audio) current = null
}
