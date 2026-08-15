export interface ChatExchange {
  q: string
  a: string
  ts: number
}

const KEY = 'jarvis-chat-log'
const CAP = 100

export function getChatLog(): ChatExchange[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function appendChatLog(q: string, a: string) {
  const log = [...getChatLog(), { q, a, ts: Date.now() }].slice(-CAP)
  try {
    localStorage.setItem(KEY, JSON.stringify(log))
  } catch {
    /* storage full — memory keeps working for the session */
  }
}

export function clearChatLog() {
  localStorage.removeItem(KEY)
}
