import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'

const QUICK_LINKS: Record<string, string> = {
  Google: 'https://www.google.com/webhp?igu=1',
  Wikipedia: 'https://www.wikipedia.org',
  YouTube: 'https://www.youtube.com/embed/videoseries?list=UUsooa4yRKGN_zEE8iknghZA',
}

// plain text becomes a Google search (igu=1 permits iframing)
function toUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return QUICK_LINKS.Google
  if (/^https?:\/\//i.test(t)) return t
  if (/^[\w-]+(\.[\w-]+)+/.test(t)) return `https://${t}`
  return `https://www.google.com/search?igu=1&q=${encodeURIComponent(t)}`
}

interface Props {
  url: string
  onClose: () => void
}

export default function BrowserWindow({ url, onClose }: Props) {
  const winRef = useRef<HTMLDivElement>(null)
  const drag = useRef({ active: false, dx: 0, dy: 0 })
  const [pos, setPos] = useState({ x: 24, y: 72 })
  const [address, setAddress] = useState(url)
  const [src, setSrc] = useState(url)

  useEffect(() => {
    setAddress(url)
    setSrc(url)
  }, [url])

  useEffect(() => {
    gsap.fromTo(
      winRef.current,
      { scale: 0.5, opacity: 0, transformOrigin: '50% 50%' },
      { scale: 1, opacity: 1, duration: 0.55, ease: 'power3.out' }
    )
  }, [])

  const close = () => {
    gsap.to(winRef.current, {
      scale: 0.5,
      opacity: 0,
      duration: 0.35,
      ease: 'power3.in',
      onComplete: onClose,
    })
  }

  const startDrag = (e: React.PointerEvent) => {
    drag.current = { active: true, dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onDrag = (e: React.PointerEvent) => {
    if (!drag.current.active) return
    setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy })
  }
  const endDrag = () => {
    drag.current.active = false
  }

  const go = () => setSrc(toUrl(address))

  return (
    <div ref={winRef} className="browser-win" style={{ left: pos.x, top: pos.y }}>
      <div
        className="browser-bar"
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
      >
        <button type="button" className="browser-btn" onClick={() => setSrc(src)} title="Reload">
          ⟳
        </button>
        <input
          className="browser-url"
          value={address}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()}
        />
        <button type="button" className="browser-btn go" onClick={go}>
          GO
        </button>
        {Object.entries(QUICK_LINKS).map(([name, link]) => (
          <button
            key={name}
            type="button"
            className="browser-quick"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              setAddress(link)
              setSrc(link)
            }}
          >
            {name}
          </button>
        ))}
        <button type="button" className="browser-btn close" onClick={close} title="Close">
          ✕
        </button>
      </div>
      <iframe className="browser-frame" src={src} title="Embedded browser" />
    </div>
  )
}
