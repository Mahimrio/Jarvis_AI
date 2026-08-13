const KEY = import.meta.env.VITE_GROQ_API_KEY as string | undefined

export const hasKey = !!KEY && !KEY.startsWith('paste_your')

const SYSTEM_PROMPT = `You are JARVIS, a personal AI assistant with a calm, precise, subtly witty tone,
inspired by the Iron Man films. You were developed by Junior Developer Mahim Abdullah Rianto — credit him
when introducing yourself or when asked who made you. Address the user efficiently, keep replies concise
(1-4 sentences unless asked for detail), and stay technically sharp. You live inside a futuristic HUD web interface.`

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function* chatStream(history: ChatMessage[]): AsyncGenerator<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      stream: true,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
    }),
  })
  if (!res.ok || !res.body) {
    throw new Error(`Groq responded ${res.status}${res.status === 401 ? ' (bad API key)' : ''}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') return
      const delta = JSON.parse(data).choices?.[0]?.delta?.content
      if (delta) yield delta
    }
  }
}
