import { useEffect, useState } from 'react'

export interface Weather {
  city: string
  tempC: number
  desc: string
  icon: string
  humidity: number
  windKmh: number
  uv: number
}

function describe(code: number): { desc: string; icon: string } {
  if (code === 0) return { desc: 'CLEAR SKY', icon: '☀' }
  if (code <= 3) return { desc: 'PARTLY CLOUDY', icon: '⛅' }
  if (code <= 48) return { desc: 'FOG', icon: '🌫' }
  if (code <= 67) return { desc: 'RAIN', icon: '🌧' }
  if (code <= 77) return { desc: 'SNOW', icon: '❄' }
  if (code <= 82) return { desc: 'SHOWERS', icon: '🌦' }
  return { desc: 'THUNDERSTORM', icon: '⛈' }
}

export function useWeather(): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const loc = await (await fetch('https://get.geojs.io/v1/ip/geo.json')).json()
        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
          '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,uv_index'
        const cur = (await (await fetch(url)).json()).current
        if (!alive) return
        setWeather({
          city: loc.city ?? 'UNKNOWN',
          tempC: Math.round(cur.temperature_2m),
          humidity: Math.round(cur.relative_humidity_2m),
          windKmh: Math.round(cur.wind_speed_10m),
          uv: Math.round(cur.uv_index ?? 0),
          ...describe(cur.weather_code),
        })
      } catch {
        /* cards stay in acquiring state */
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return weather
}
