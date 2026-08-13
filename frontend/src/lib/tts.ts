const TTS_URL = 'http://localhost:8765'

let current: HTMLAudioElement | null = null

export async function ttsAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${TTS_URL}/health`)
    return (await res.json()).model_loaded === true
  } catch {
    return false
  }
}

export function stopSpeaking() {
  current?.pause()
  current = null
}

// resolves when playback finishes
export async function speak(text: string): Promise<void> {
  const res = await fetch(`${TTS_URL}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(`TTS server responded ${res.status}`)
  const url = URL.createObjectURL(await res.blob())
  stopSpeaking()
  const audio = new Audio(url)
  current = audio
  await new Promise<void>((resolve) => {
    audio.onended = () => resolve()
    audio.onerror = () => resolve()
    audio.onpause = () => resolve()
    audio.play().catch(() => resolve())
  })
  URL.revokeObjectURL(url)
  if (current === audio) current = null
}
