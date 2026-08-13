import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'

export type Anchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'

const WIN_W = 560
const WIN_H = 420

function anchorXY(a: Anchor): { x: number; y: number } {
  const m = 16
  const sidebar = 76
  const top = 64
  const bottom = 52
  const vw = window.innerWidth
  const vh = window.innerHeight
  switch (a) {
    case 'top-left':
      return { x: sidebar + m, y: top + m }
    case 'top-right':
      return { x: vw - WIN_W - m, y: top + m }
    case 'bottom-left':
      return { x: sidebar + m, y: vh - WIN_H - bottom - m }
    case 'bottom-right':
      return { x: vw - WIN_W - m, y: vh - WIN_H - bottom - m }
    default:
      return { x: (vw - WIN_W) / 2, y: (vh - WIN_H) / 2 }
  }
}

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
  position: Anchor
  onClose: () => void
}

export default function BrowserWindow({ url, position, onClose }: Props) {
  const winRef = useRef<HTMLDivElement>(null)
  const drag = useRef({ active: false, dx: 0, dy: 0 })
  const [pos, setPos] = useState(() => anchorXY('center'))
  const [address, setAddress] = useState(url)
  const [src, setSrc] = useState(url)
  const mounted = useRef(false)

  useEffect(() => {
    setAddress(url)
    setSrc(url)
  }, [url])

  // fly the window to its anchor: zoom in center first on mount, then dock
  useEffect(() => {
    const target = anchorXY(position)
    const proxy = { ...pos }
    if (!mounted.current) {
      mounted.current = true
      const tl = gsap.timeline()
      tl.fromTo(
        winRef.current,
        { scale: 0.45, opacity: 0, transformOrigin: '50% 50%' },
        { scale: 1, opacity: 1, duration: 0.5, ease: 'power3.out' }
      )
      if (position !== 'center') {
        tl.to(proxy, {
          x: target.x,
          y: target.y,
          duration: 0.85,
          ease: 'power3.inOut',
          onUpdate: () => setPos({ x: proxy.x, y: proxy.y }),
        }, '+=0.25')
        tl.fromTo(winRef.current, { scale: 1 }, { scale: 0.96, yoyo: true, repeat: 1, duration: 0.42 }, '<')
      }
      return
    }
    gsap.to(proxy, {
      x: target.x,
      y: target.y,
      duration: 0.85,
      ease: 'power3.inOut',
      onUpdate: () => setPos({ x: proxy.x, y: proxy.y }),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position])

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
