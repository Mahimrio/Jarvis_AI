import { useEffect, useState } from 'react'

export type FeedKind = 'news' | 'system' | 'note'

export interface FeedItem {
  id: string
  ts: number
  kind: FeedKind
  title: string
  detail?: string
  url?: string
}

const STORE_KEY = 'jarvis-feed-v1'
const SEEN_KEY = 'jarvis-feed-seen'
const BACKEND_KEY = 'jarvis-feed-backend'
const MAX_ITEMS = 200
const NEWS_KEY = import.meta.env.VITE_NEWS_API_KEY as string | undefined

let items: FeedItem[] = loadItems()
const subscribers = new Set<() => void>()

function loadItems(): FeedItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(items))
  } catch {
    /* storage full — feed keeps working in memory */
  }
}

function notify() {
  subscribers.forEach((cb) => cb())
}

export function getFeed(): FeedItem[] {
  return items
}

export function addFeedItem(item: Omit<FeedItem, 'id' | 'ts'> & { id?: string; ts?: number }) {
  const id = item.id ?? `${item.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  if (items.some((it) => it.id === id)) return
  const entry: FeedItem = { ts: Date.now(), ...item, id }
  items = [entry, ...items].sort((a, b) => b.ts - a.ts).slice(0, MAX_ITEMS)
  persist()
  notify()
}

export function clearFeed() {
  items = []
  persist()
  notify()
}

export function getUnreadCount(): number {
  const seen = Number(localStorage.getItem(SEEN_KEY) ?? 0)
  return items.filter((it) => it.ts > seen).length
}

export function markFeedSeen() {
  localStorage.setItem(SEEN_KEY, String(Date.now()))
  notify()
}

export function subscribeFeed(cb: () => void): () => void {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

// React hook: re-render on any feed change
export function useFeed() {
  const [, tick] = useState(0)
  useEffect(() => subscribeFeed(() => tick((n) => n + 1)), [])
  return { items: getFeed(), unread: getUnreadCount() }
}

// ---- news source (Currents API, HN fallback) ---------------------------

// one category per poll keeps us near ~120 requests/day on the 250/day free tier
const NEWS_ROTATION = [
  { label: 'WORLD', ep: 'latest-news', qs: 'category=world' },
  { label: 'TECH', ep: 'latest-news', qs: 'category=technology' },
  { label: 'SCIENCE', ep: 'latest-news', qs: 'category=science' },
  { label: 'SPORTS', ep: 'latest-news', qs: 'category=sports' },
  { label: 'BANGLADESH', ep: 'search', qs: 'keywords=Bangladesh' }, // keywords only valid on /search
]
let rotationIdx = Math.floor(Math.random() * NEWS_ROTATION.length)

// automated junk that floods Currents (CVE bots, schedule dumps, changelogs)
const JUNK_TITLE = /^(CVE-\d|GHSA-|\[?PATCH\b)|schedule\b.*wttw/i
const JUNK_DOMAINS = ['vuldb.com', 'github.com/advisories', 'lwn.net/Articles']

function isJunk(a: CurrentsArticle): boolean {
  if (JUNK_TITLE.test(a.title)) return true
  return JUNK_DOMAINS.some((d) => a.url?.includes(d))
}

interface CurrentsArticle {
  id: string
  title: string
  url: string
  published: string // "2026-08-15 08:02:44 +0000"
  category?: string[]
}

async function pollCurrents(): Promise<boolean> {
  if (!NEWS_KEY) return false
  const slot = NEWS_ROTATION[rotationIdx % NEWS_ROTATION.length]
  rotationIdx++
  try {
    const res = await fetch(
      `https://api.currentsapi.services/v1/${slot.ep}?language=en&page_size=20&${slot.qs}&apiKey=${NEWS_KEY}`,
    )
    if (!res.ok) return false
    const data = await res.json()
    if (data.status !== 'ok' || !Array.isArray(data.news)) return false
    let kept = 0
    for (const a of data.news as CurrentsArticle[]) {
      if (!a?.title || !a.id || isJunk(a)) continue
      if (++kept > 5) break
      addFeedItem({
        id: `news-${a.id}`,
        ts: Date.parse(a.published) || Date.now(),
        kind: 'news',
        title: a.title.trim(),
        detail: slot.label,
        url: a.url,
      })
    }
    return kept > 0
  } catch {
    return false
  }
}

async function pollHackerNews() {
  try {
    const ids: number[] = await (
      await fetch('https://hacker-news.firebaseio.com/v0/topstories.json')
    ).json()
    const stories = await Promise.all(
      ids.slice(0, 6).map((id) =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then((r) => r.json()).catch(() => null),
      ),
    )
    for (const s of stories) {
      if (!s?.title) continue
      addFeedItem({
        id: `news-hn-${s.id}`,
        ts: (s.time ?? Date.now() / 1000) * 1000,
        kind: 'news',
        title: s.title,
        detail: 'HN',
        url: s.url ?? `https://news.ycombinator.com/item?id=${s.id}`,
      })
    }
  } catch {
    /* offline — next poll catches up */
  }
}

async function pollNews() {
  const ok = await pollCurrents()
  if (!ok) await pollHackerNews() // quota/key/network failure — keyless fallback
}

// ---- system watchers ----------------------------------------------------

async function checkBackend() {
  let online = false
  try {
    const res = await fetch('http://localhost:8765/health')
    online = (await res.json()).model_loaded === true
  } catch {
    online = false
  }
  const prev = localStorage.getItem(BACKEND_KEY)
  // transition detection survives page closes: report a server that died while away
  if (prev !== null && prev !== String(online)) {
    addFeedItem({
      kind: 'system',
      title: online ? 'Voice server back online' : 'Voice server went offline',
      detail: online ? 'Cloned JARVIS voice available.' : 'Text replies continue without voice.',
    })
  }
  localStorage.setItem(BACKEND_KEY, String(online))
}

let started = false

// idempotent: call once from App
export function initFeedSources() {
  if (started) return
  started = true

  // purge previously stored junk articles
  const before = items.length
  items = items.filter((it) => it.kind !== 'news' || !isJunk({ id: it.id, title: it.title, url: it.url ?? '', published: '' }))
  if (items.length !== before) {
    persist()
    notify()
  }

  void pollNews()
  setInterval(pollNews, 12 * 60 * 1000)

  void checkBackend()
  setInterval(checkBackend, 30 * 1000)

  window.addEventListener('offline', () =>
    addFeedItem({ kind: 'system', title: 'Network connection lost' }),
  )
  window.addEventListener('online', () =>
    addFeedItem({ kind: 'system', title: 'Network connection restored' }),
  )
}
