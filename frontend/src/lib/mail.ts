import { useEffect, useState } from 'react'

const MAIL_URL = 'http://localhost:8765'

export interface MailSummary {
  uid: string
  sender: string
  subject: string
  ts: number
  unread: boolean
}

export interface MailMessage extends Omit<MailSummary, 'unread'> {
  body: string
}

export async function fetchMailStatus(): Promise<{ configured: boolean; unread: number }> {
  try {
    const res = await fetch(`${MAIL_URL}/mail/status`)
    if (!res.ok) return { configured: false, unread: 0 }
    return await res.json()
  } catch {
    return { configured: false, unread: 0 }
  }
}

export async function fetchInbox(limit = 20): Promise<MailSummary[]> {
  const res = await fetch(`${MAIL_URL}/mail/inbox?limit=${limit}`)
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `Mail server ${res.status}`)
  return (await res.json()).messages
}

export async function fetchMessage(uid: string): Promise<MailMessage> {
  const res = await fetch(`${MAIL_URL}/mail/message/${uid}`)
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? `Mail server ${res.status}`)
  return await res.json()
}

// sidebar badge: unread count polled every 90s (each poll is one IMAP login)
export function useMailUnread(): number {
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    let alive = true
    const poll = async () => {
      const st = await fetchMailStatus()
      if (alive) setUnread(st.configured ? st.unread : 0)
    }
    void poll()
    const id = setInterval(poll, 90 * 1000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])
  return unread
}

// chat tool: compact inbox summary for the LLM to relay
export async function mailSummaryForChat(): Promise<string> {
  const st = await fetchMailStatus()
  if (!st.configured) return 'Mail is not configured — GMAIL_ADDRESS and GMAIL_APP_PASSWORD are missing in backend/.env.'
  const inbox = await fetchInbox(5)
  const lines = inbox.map(
    (m) => `${m.unread ? '[UNREAD] ' : ''}${m.subject} — from ${m.sender.replace(/<.*>/, '').trim()}`,
  )
  return `${st.unread} unread message(s). Latest mail:\n${lines.join('\n')}`
}
