import { useEffect, useState } from 'react'
import { STATES, type OrbState } from './states'

function useFps() {
  const [fps, setFps] = useState(60)
  useEffect(() => {
    let frames = 0
    let last = performance.now()
    let raf: number
    const loop = (now: number) => {
      frames++
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)))
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return fps
}

function useLatency() {
  const [ms, setMs] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    const ping = async () => {
      const t0 = performance.now()
      try {
        await fetch('/favicon.svg', { cache: 'no-store' })
        if (alive) setMs(Math.round(performance.now() - t0))
      } catch {
        if (alive) setMs(null)
      }
    }
    ping()
    const id = setInterval(ping, 5000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])
  return ms
}

function useUptime() {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs / 60) % 60))}:${pad(secs % 60)}`
}

interface HeapInfo {
  usedJSHeapSize: number
  jsHeapSizeLimit: number
}

function useRam() {
  const [pct, setPct] = useState<number | null>(null)
  useEffect(() => {
    const read = () => {
      const mem = (performance as unknown as { memory?: HeapInfo }).memory
      setPct(mem ? Math.round((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100) : null)
    }
    read()
    const id = setInterval(read, 2000)
    return () => clearInterval(id)
  }, [])
  return pct
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

interface Props {
  state: OrbState
  onToggleBrowser: () => void
  onSelectState: (s: OrbState) => void
}

export default function HudBar({ state, onToggleBrowser, onSelectState }: Props) {
  const fps = useFps()
  const latency = useLatency()
  const uptime = useUptime()
  const ram = useRam()
  const online = useOnline()
  const [protocolOpen, setProtocolOpen] = useState(false)
  const [protocolClosing, setProtocolClosing] = useState(false)

  const toggleProtocol = () => {
    if (protocolOpen && !protocolClosing) {
      setProtocolClosing(true)
      setTimeout(() => {
        setProtocolOpen(false)
        setProtocolClosing(false)
      }, 240)
    } else if (!protocolOpen) {
      setProtocolOpen(true)
    }
  }

  return (
    <header className="hud-top">
      <div className="hud-left">
        <div className="wordmark-badge">J</div>
        <div>
          <div className="wordmark">JARVIS</div>
          <div className="wordmark-sub">NEURAL INTERFACE SYSTEM</div>
        </div>
      </div>
      <div className="hud-center">
        <span className="hud-chip cut">
          <em>SYSTEM STATUS</em>
          {fps >= 30 ? 'OPTIMAL' : 'DEGRADED'}
        </span>
        <span className="hud-chip cut">
          <em>FPS</em>
          {fps}
        </span>
        {ram !== null && (
          <span className="hud-chip cut">
            <em>RAM</em>
            {ram}%
          </span>
        )}
        <span className="hud-chip cut">
          <em>NETWORK</em>
          {online ? `ONLINE${latency === null ? '' : ` ${latency}ms`}` : 'OFFLINE'}
        </span>
        <div className="protocol-wrap">
          <button
            type="button"
            className={`hud-chip cut hud-chip-state${protocolOpen ? ' open' : ''}`}
            onClick={toggleProtocol}
            title="Protocol states"
          >
            <em>PROTOCOL ▾</em>
            <span>
              <span className="pulse-dot">●</span> {state.toUpperCase()}
            </span>
          </button>
          {protocolOpen && (
            <div className={`protocol-drop${protocolClosing ? ' closing' : ''}`}>
              <div className="protocol-drop-label">SELECT PROTOCOL</div>
              <div className="protocol-drop-grid">
                {STATES.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    className={`protocol-chip${s === state ? ' active' : ''}`}
                    style={{ animationDelay: `${60 + i * 26}ms` }}
                    onClick={() => {
                      onSelectState(s)
                      toggleProtocol()
                    }}
                  >
                    ● {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <span className="hud-chip cut hud-uptime">
          <em>UPTIME</em>
          {uptime}
        </span>
      </div>
      <div className="hud-right">
        <button type="button" className="hud-btn hud-btn-primary" onClick={onToggleBrowser}>
          ⊕ BROWSER
        </button>
      </div>
    </header>
  )
}
