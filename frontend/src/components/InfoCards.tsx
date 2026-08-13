import { useEffect, useState } from 'react'
import { useWeather } from '../lib/weather'

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export default function InfoCards() {
  const now = useClock()
  const weather = useWeather()

  let h = now.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  const mins = String(now.getMinutes()).padStart(2, '0')
  const day = now.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()

  return (
    <div className="info-cards">
      <div className="card cut">
        <div className="card-big">
          {h}
          <span className="blink-sep">:</span>
          {mins}
          <span className="card-unit">{ampm}</span>
        </div>
        <div className="card-sub">{day}</div>
        <div className="card-sub dim">{date}</div>
      </div>
      <div className="card cut">
        {weather ? (
          <>
            <div className="card-big">
              {weather.tempC}°C <span className="card-icon">{weather.icon}</span>
            </div>
            <div className="card-sub">{weather.desc}</div>
            <div className="card-sub dim">◎ {weather.city.toUpperCase()}</div>
          </>
        ) : (
          <div className="card-sub dim">ACQUIRING WEATHER…</div>
        )}
      </div>
      <div className="card cut">
        {weather ? (
          <>
            <div className="card-row">
              <span>HUMIDITY</span>
              <span className="card-val">💧 {weather.humidity}%</span>
            </div>
            <div className="card-row">
              <span>WIND SPEED</span>
              <span className="card-val">≋ {weather.windKmh} km/h</span>
            </div>
            <div className="card-row">
              <span>UV INDEX</span>
              <span className="card-val">☀ {weather.uv}</span>
            </div>
          </>
        ) : (
          <div className="card-sub dim">ACQUIRING TELEMETRY…</div>
        )}
      </div>
    </div>
  )
}
