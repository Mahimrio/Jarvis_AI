import type { Anchor } from '../components/BrowserWindow'

// real Chrome popup windows, opened/positioned/closed by Jarvis
let win: Window | null = null

const W = 900
const H = 640

function coords(anchor: Anchor): { left: number; top: number } {
  const sw = window.screen.availWidth
  const sh = window.screen.availHeight
  const m = 24
  switch (anchor) {
    case 'top-left':
      return { left: m, top: m }
    case 'top-right':
      return { left: sw - W - m, top: m }
    case 'bottom-left':
      return { left: m, top: sh - H - m }
    case 'bottom-right':
      return { left: sw - W - m, top: sh - H - m }
    default:
      return { left: Math.max(0, (sw - W) / 2), top: Math.max(0, (sh - H) / 2) }
  }
}

export function openRealBrowser(url: string, anchor: Anchor): string {
  const { left, top } = coords(anchor)
  const features = `popup=yes,width=${W},height=${H},left=${left},top=${top}`
  const opened = window.open(url, 'jarvis-chrome', features)
  if (!opened) {
    return 'Popup blocked — click the blocked-popup icon in the address bar and choose "Always allow pop-ups from this site", then ask me again.'
  }
  win = opened
  try {
    win.moveTo(left, top)
    win.resizeTo(W, H)
  } catch {
    /* cross-origin after navigation — position was applied at open */
  }
  win.focus()
  return `Opened a real Chrome window at ${anchor} showing ${url}`
}

export function moveRealBrowser(anchor: Anchor): string {
  if (!win || win.closed) return 'No Chrome window is open.'
  const { left, top } = coords(anchor)
  try {
    win.moveTo(left, top)
    win.focus()
    return `Chrome window moved to ${anchor}`
  } catch {
    return 'The window refused to move (browser restriction).'
  }
}

export function closeRealBrowser(): string {
  if (!win || win.closed) return 'No Chrome window is open.'
  win.close()
  win = null
  return 'Chrome window closed.'
}
