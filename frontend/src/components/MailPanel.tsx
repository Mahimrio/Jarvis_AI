import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { fetchInbox, fetchMessage, fetchMailStatus, type MailSummary, type MailMessage } from '../lib/mail'

function timeAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(ts).toLocaleDateString()
}

function senderName(raw: string): string {
  return raw.replace(/<.*>/, '').replace(/"/g, '').trim() || raw
}

interface Props {
  closing: boolean
  onRequestClose: () => void
  onClosed: () => void
}

export default function MailPanel({ closing, onRequestClose, onClosed }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [inbox, setInbox] = useState<MailSummary[]>([])
  const [openMsg, setOpenMsg] = useState<MailMessage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const st = await fetchMailStatus()
      setConfigured(st.configured)
      if (st.configured) setInbox(await fetchInbox())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
    tl.from(panelRef.current, { x: -46, opacity: 0, scaleY: 0.92, transformOrigin: 'left center', duration: 0.38 })
    return () => {
      tl.revert()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!closing) return
    gsap.to(panelRef.current, {
      x: -46,
      opacity: 0,
      scaleY: 0.92,
      transformOrigin: 'left center',
      duration: 0.3,
      ease: 'power2.in',
      onComplete: onClosed,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing])

  const openMessage = async (uid: string) => {
    setLoading(true)
    setError('')
    try {
      setOpenMsg(await fetchMessage(uid))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div ref={panelRef} className="feed-panel cut mail-panel">
      <div className="feed-head">
        <span className="feed-heading">
          <span className="feed-live-dot" /> MAILBOX
        </span>
        <div className="feed-actions">
          {openMsg ? (
            <button type="button" className="feed-btn" onClick={() => setOpenMsg(null)}>
              ❮ BACK
            </button>
          ) : (
            <button type="button" className="feed-btn" onClick={refresh} title="Refresh">
              ⟳
            </button>
          )}
          <button type="button" className="feed-btn" onClick={onRequestClose} title="Close mail">
            ✕
          </button>
        </div>
      </div>
      <div className="feed-list">
        {loading && <p className="feed-empty">Contacting mail server…</p>}
        {!loading && error && <p className="feed-empty">Uplink error: {error}</p>}
        {!loading && !error && configured === false && (
          <div className="mail-setup">
            <p className="feed-empty">Mailbox not linked yet, sir.</p>
            <p className="mail-steps">
              1. Enable 2-Step Verification on your Google account
              <br />
              2. Create an App Password at myaccount.google.com/apppasswords
              <br />
              3. Add to backend/.env:
              <br />
              <code>GMAIL_ADDRESS=you@gmail.com</code>
              <br />
              <code>GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx</code>
              <br />
              4. Restart the voice server
            </p>
          </div>
        )}
        {!loading && !error && openMsg && (
          <div className="mail-bodyview">
            <p className="mail-subject">{openMsg.subject}</p>
            <span className="feed-meta">
              {senderName(openMsg.sender)} · {timeAgo(openMsg.ts)}
            </span>
            <p className="mail-body">{openMsg.body || '(empty message)'}</p>
          </div>
        )}
        {!loading && !error && !openMsg && configured && inbox.length === 0 && (
          <p className="feed-empty">Inbox is empty, sir.</p>
        )}
        {!loading &&
          !error &&
          !openMsg &&
          configured &&
          inbox.map((m, i) => (
            <div
              key={m.uid}
              className={`feed-entry linked${m.unread ? ' mail-unread' : ''}`}
              style={{ animationDelay: `${Math.min(i, 10) * 0.04}s` }}
              onClick={() => openMessage(m.uid)}
              role="button"
            >
              <span className="feed-icon">{m.unread ? '✉' : '✓'}</span>
              <div className="feed-body">
                <p className="feed-title">{m.subject}</p>
                <span className="feed-meta">
                  {senderName(m.sender)} · {timeAgo(m.ts)}
                </span>
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
