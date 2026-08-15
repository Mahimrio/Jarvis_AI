import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useFeed, clearFeed, markFeedSeen, type FeedItem, type FeedKind } from '../lib/feed'

const KIND_ICON: Record<string, string> = { news: '▤', system: '⬡', note: '✎' }

const FILTERS: { label: string; kind: FeedKind | 'all' }[] = [
  { label: 'ALL', kind: 'all' },
  { label: 'NEWS', kind: 'news' },
  { label: 'NOTES', kind: 'note' },
  { label: 'BACKEND', kind: 'system' },
]

function timeAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(ts).toLocaleDateString()
}

interface Props {
  closing: boolean
  onOpenLink: (url: string) => void
  onRequestClose: () => void
  onClosed: () => void
}

export default function FeedPanel({ closing, onOpenLink, onRequestClose, onClosed }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const { items } = useFeed()
  const [filter, setFilter] = useState<FeedKind | 'all'>('all')

  // entrance: panel sweeps in, header and filter chips cascade
  useEffect(() => {
    markFeedSeen()
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
    tl.from(panelRef.current, { x: -46, opacity: 0, scaleY: 0.92, transformOrigin: 'left center', duration: 0.38 })
      .from('.feed-head', { opacity: 0, y: -8, duration: 0.25 }, '-=0.15')
      .from('.feed-filters .feed-chip', { opacity: 0, y: -6, stagger: 0.05, duration: 0.2 }, '-=0.1')
    return () => {
      tl.revert()
    }
  }, [])

  // exit: reverse sweep, then let the parent unmount us
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

  const visible = filter === 'all' ? items : items.filter((it) => it.kind === filter)
  const countFor = (k: FeedKind | 'all') => (k === 'all' ? items.length : items.filter((it) => it.kind === k).length)

  const entry = (it: FeedItem, i: number) => (
    <div
      key={it.id}
      className={`feed-entry ${it.kind}${it.url ? ' linked' : ''}`}
      style={{ animationDelay: `${Math.min(i, 10) * 0.04}s` }}
      onClick={it.url ? () => onOpenLink(it.url!) : undefined}
      role={it.url ? 'button' : undefined}
    >
      <span className="feed-icon">{KIND_ICON[it.kind]}</span>
      <div className="feed-body">
        <p className="feed-title">{it.title}</p>
        <span className="feed-meta">
          {timeAgo(it.ts)}
          {it.detail ? ` · ${it.detail}` : ''}
        </span>
      </div>
    </div>
  )

  return (
    <div ref={panelRef} className="feed-panel cut">
      <div className="feed-head">
        <span className="feed-heading">
          <span className="feed-live-dot" /> LIVE FEED
        </span>
        <div className="feed-actions">
          <button type="button" className="feed-btn" onClick={clearFeed} title="Clear feed">
            CLEAR
          </button>
          <button type="button" className="feed-btn" onClick={onRequestClose} title="Close feed">
            ✕
          </button>
        </div>
      </div>
      <div className="feed-filters">
        {FILTERS.map((f) => (
          <button
            key={f.kind}
            type="button"
            className={`feed-chip${filter === f.kind ? ' active' : ''}`}
            onClick={() => setFilter(f.kind)}
          >
            {f.label}
            <em>{countFor(f.kind)}</em>
          </button>
        ))}
      </div>
      <div className="feed-list" key={filter}>
        {visible.length === 0 ? (
          <p className="feed-empty">No events here yet, sir. The wire is quiet.</p>
        ) : (
          visible.map(entry)
        )}
      </div>
    </div>
  )
}
