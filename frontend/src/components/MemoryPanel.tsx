import { useState } from 'react'
import SidePanel from './SidePanel'
import { getChatLog, clearChatLog } from '../lib/memlog'

function timeAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(ts).toLocaleDateString()
}

interface Props {
  closing: boolean
  onRequestClose: () => void
  onClosed: () => void
}

export default function MemoryPanel(props: Props) {
  const [log, setLog] = useState(() => [...getChatLog()].reverse())

  return (
    <SidePanel
      title="MEMORY BANK"
      {...props}
      actions={
        <button
          type="button"
          className="feed-btn"
          onClick={() => {
            clearChatLog()
            setLog([])
          }}
        >
          WIPE
        </button>
      }
    >
      {log.length === 0 ? (
        <p className="feed-empty">No conversations remembered yet, sir.</p>
      ) : (
        log.map((ex, i) => (
          <div key={ex.ts + '-' + i} className="mem-entry" style={{ animationDelay: `${Math.min(i, 10) * 0.04}s` }}>
            <p className="mem-q">❯ {ex.q}</p>
            <p className="mem-a">{ex.a}</p>
            <span className="feed-meta">{timeAgo(ex.ts)}</span>
          </div>
        ))
      )}
    </SidePanel>
  )
}
