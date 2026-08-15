import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'

const BOOT_LINES = [
  'JARVIS OS v2.6 // STARK KERNEL 7.1',
  'NEURAL CORE ............... ONLINE',
  'PARTICLE MATRIX ........... CALIBRATED',
  'VOICE ENGINE .............. LINKED',
  'UPLINKS GROQ · GEMINI ..... SECURED',
  'NEURAL LINK ESTABLISHED',
]

export default function BootOverlay({ onDone }: { onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setShown((n) => {
        if (n >= BOOT_LINES.length) {
          clearInterval(id)
          return n
        }
        return n + 1
      })
    }, 230)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (shown < BOOT_LINES.length) return
    const t = setTimeout(() => {
      gsap.to(rootRef.current, { autoAlpha: 0, duration: 0.55, ease: 'power2.in', onComplete: onDone })
    }, 420)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])

  return (
    <div ref={rootRef} className="boot-overlay">
      <div className="boot-box">
        <div className="boot-mark">J</div>
        <div className="boot-lines">
          {BOOT_LINES.slice(0, shown).map((l, i) => (
            <p key={i} className={i === BOOT_LINES.length - 1 ? 'boot-line final' : 'boot-line'}>
              {l}
            </p>
          ))}
          {shown < BOOT_LINES.length && <span className="boot-cursor">▊</span>}
        </div>
        <div className="boot-progress">
          <div className="boot-progress-fill" style={{ width: `${(shown / BOOT_LINES.length) * 100}%` }} />
        </div>
      </div>
    </div>
  )
}
