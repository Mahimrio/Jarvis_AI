export interface JarvisSettings {
  voiceOn: boolean
  defaultMode: 'auto' | string
  newsCats: string[]
  wakeOn: boolean
  browserMode: 'embedded' | 'real'
}

const KEY = 'jarvis-settings'
export const ALL_NEWS_CATS = ['WORLD', 'TECH', 'SCIENCE', 'SPORTS', 'BANGLADESH']

const DEFAULTS: JarvisSettings = {
  voiceOn: true,
  defaultMode: 'auto',
  newsCats: [...ALL_NEWS_CATS],
  wakeOn: true,
  browserMode: 'real',
}

export function getSettings(): JarvisSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setSetting<K extends keyof JarvisSettings>(key: K, value: JarvisSettings[K]) {
  const next = { ...getSettings(), [key]: value }
  localStorage.setItem(KEY, JSON.stringify(next))
}
