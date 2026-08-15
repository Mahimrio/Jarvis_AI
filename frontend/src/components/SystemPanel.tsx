import { useEffect, useRef, useState } from 'react'
import SidePanel from './SidePanel'

interface Props {
  closing: boolean
  onRequestClose: () => void
  onClosed: () => void
}

function gpuName(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    if (!gl) return 'unavailable'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const raw = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
    return raw.replace(/ANGLE \(|\)$/g, '').split(',').slice(0, 2).join(',') || 'unknown'
  } catch {
    return 'unknown'
  }
}

interface Stats {
  fps: number
  ram: string
  uptime: string
  voice: string
}

export default function SystemPanel(props: Props) {
  const [stats, setStats] = useState<Stats>({ fps: 0, ram: '—', uptime: '—', voice: 'checking…' })
  const frames = useRef(0)
  const gpu = useRef(gpuName())

  useEffect(() => {
    let raf = 0
    const count = () => {
      frames.current++
      raf = requestAnimationFrame(count)
    }
    raf = requestAnimationFrame(count)

    const tick = setInterval(() => {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory
      const up = performance.now() / 1000
      setStats((s) => ({
        ...s,
        fps: frames.current,
        ram: mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB / ${(mem.jsHeapSizeLimit / 1048576 / 1024).toFixed(1)} GB` : 'n/a',
        uptime: `${String(Math.floor(up / 3600)).padStart(2, '0')}:${String(Math.floor((up % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(up % 60)).padStart(2, '0')}`,
      }))
      frames.current = 0
    }, 1000)

    fetch('http://localhost:8765/health')
      .then((r) => r.json())
      .then((h) => setStats((s) => ({ ...s, voice: h.model_loaded ? `ONLINE · ${h.voice} @ ${h.sample_rate}Hz` : 'OFFLINE' })))
      .catch(() => setStats((s) => ({ ...s, voice: 'OFFLINE' })))

    return () => {
      cancelAnimationFrame(raf)
      clearInterval(tick)
    }
  }, [])

  const rows: [string, string][] = [
    ['CORE STATUS', stats.fps >= 45 ? 'OPTIMAL' : stats.fps > 0 ? 'DEGRADED' : '—'],
    ['RENDER RATE', `${stats.fps} FPS`],
    ['HEAP MEMORY', stats.ram],
    ['CPU THREADS', String(navigator.hardwareConcurrency ?? 'n/a')],
    ['GPU', gpu.current],
    ['DISPLAY', `${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}x`],
    ['SESSION UPTIME', stats.uptime],
    ['VOICE SERVER', stats.voice],
    ['PLATFORM', navigator.platform || 'unknown'],
  ]

  return (
    <SidePanel title="SYSTEM CORE" {...props}>
      {rows.map(([label, value], i) => (
        <div key={label} className="stat-row" style={{ animationDelay: `${i * 0.04}s` }}>
          <span className="stat-label">{label}</span>
          <span className="stat-value">{value}</span>
        </div>
      ))}
    </SidePanel>
  )
}
