import { useEffect, useRef, type ReactNode } from 'react'
import gsap from 'gsap'

interface Props {
  title: string
  closing: boolean
  onRequestClose: () => void
  onClosed: () => void
  actions?: ReactNode
  children: ReactNode
}

// shared slide-out shell: same entrance/exit choreography as the feed panel
export default function SidePanel({ title, closing, onRequestClose, onClosed, actions, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
    tl.from(panelRef.current, { x: -46, opacity: 0, scaleY: 0.92, transformOrigin: 'left center', duration: 0.38 })
    return () => {
      tl.revert()
    }
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

  return (
    <div ref={panelRef} className="feed-panel cut">
      <div className="feed-head">
        <span className="feed-heading">
          <span className="feed-live-dot" /> {title}
        </span>
        <div className="feed-actions">
          {actions}
          <button type="button" className="feed-btn" onClick={onRequestClose} title="Close">
            ✕
          </button>
        </div>
      </div>
      <div className="feed-list">{children}</div>
    </div>
  )
}
