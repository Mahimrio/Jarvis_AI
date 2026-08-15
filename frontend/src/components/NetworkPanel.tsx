import { useEffect, useState } from 'react'
import SidePanel from './SidePanel'

interface Props {
  closing: boolean
  onRequestClose: () => void
  onClosed: () => void
}

interface Geo {
  ip: string
  city: string
  country: string
  organization_name: string
}

export default function NetworkPanel(props: Props) {
  const [pings, setPings] = useState<number[]>([])
  const [geo, setGeo] = useState<Geo | null>(null)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    let alive = true
    const ping = async () => {
      const t0 = performance.now()
      try {
        await fetch('/favicon.svg', { cache: 'no-store' })
        if (alive) setPings((p) => [...p, Math.round(performance.now() - t0)].slice(-24))
      } catch {
        if (alive) setPings((p) => [...p, -1].slice(-24))
      }
    }
    void ping()
    const id = setInterval(ping, 2500)

    fetch('https://get.geojs.io/v1/ip/geo.json')
      .then((r) => r.json())
      .then((g) => alive && setGeo(g))
      .catch(() => {})

    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      alive = false
      clearInterval(id)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const conn = (navigator as unknown as { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection
  const valid = pings.filter((p) => p >= 0)
  const latest = valid.at(-1)
  const max = Math.max(...valid, 20)

  const rows: [string, string][] = [
    ['LINK STATUS', online ? 'ONLINE' : 'OFFLINE'],
    ['LATENCY', latest !== undefined ? `${latest} ms` : '—'],
    ['CONNECTION', conn?.effectiveType?.toUpperCase() ?? 'unknown'],
    ['BANDWIDTH', conn?.downlink ? `~${conn.downlink} Mbps` : 'unknown'],
    ['RADIO RTT', conn?.rtt !== undefined ? `${conn.rtt} ms` : 'unknown'],
    ['PUBLIC IP', geo?.ip ?? '…'],
    ['LOCATION', geo ? `${geo.city ?? '?'}, ${geo.country ?? '?'}` : '…'],
    ['PROVIDER', geo?.organization_name ?? '…'],
  ]

  return (
    <SidePanel title="NETWORK GRID" {...props}>
      <div className="spark-wrap">
        <svg className="spark" viewBox="0 0 240 48" preserveAspectRatio="none">
          {pings.map((p, i) => {
            const h = p < 0 ? 46 : Math.max(3, (p / max) * 42)
            return (
              <rect
                key={i}
                x={i * 10 + 1}
                y={48 - h}
                width={7}
                height={h}
                className={p < 0 ? 'spark-bar err' : 'spark-bar'}
              />
            )
          })}
        </svg>
        <span className="feed-meta">LATENCY · LAST {pings.length} PINGS</span>
      </div>
      {rows.map(([label, value], i) => (
        <div key={label} className="stat-row" style={{ animationDelay: `${i * 0.04}s` }}>
          <span className="stat-label">{label}</span>
          <span className="stat-value">{value}</span>
        </div>
      ))}
    </SidePanel>
  )
}
