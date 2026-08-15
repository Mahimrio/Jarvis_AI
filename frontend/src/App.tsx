import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import gsap from 'gsap'
import JarvisBlob from './components/JarvisBlob'
import HudBar from './components/HudBar'
import Console from './components/Console'
import BrowserWindow, { type Anchor } from './components/BrowserWindow'
import Sidebar, { type PanelName } from './components/Sidebar'
import InfoCards from './components/InfoCards'
import BootOverlay from './components/BootOverlay'
import FeedPanel from './components/FeedPanel'
import MailPanel from './components/MailPanel'
import MemoryPanel from './components/MemoryPanel'
import SystemPanel from './components/SystemPanel'
import NetworkPanel from './components/NetworkPanel'
import ToolsPanel from './components/ToolsPanel'
import SettingsPanel from './components/SettingsPanel'
import { isSpeaking } from './lib/tts'
import { addFeedItem, initFeedSources } from './lib/feed'
import { mailSummaryForChat } from './lib/mail'
import { getSettings } from './lib/settings'
import { openRealBrowser, moveRealBrowser, closeRealBrowser } from './lib/realBrowser'
import { STATES, type OrbState } from './components/states'

const HOME = 'https://www.google.com/webhp?igu=1'
const YT_HOME = 'https://www.youtube.com/embed/videoseries?list=UUsooa4yRKGN_zEE8iknghZA'
const PORTFOLIO = 'https://mahimrio.github.io/My_Portfolio/'

const ANCHORS: Anchor[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']

// models format position loosely ("top_right", "TOP RIGHT") — normalize to our anchors
function normalizeAnchor(value: unknown): Anchor {
  if (typeof value !== 'string') return 'center'
  const v = value.toLowerCase().replace(/[\s_]+/g, '-')
  return (ANCHORS as string[]).includes(v) ? (v as Anchor) : 'center'
}

function resolveUrl(args: Record<string, unknown>, real = false): string {
  const rawUrl = typeof args.url === 'string' ? args.url.trim() : ''
  const rawSite = typeof args.site === 'string' ? args.site.trim() : ''
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  const enc = encodeURIComponent(query)

  // a direct URL may arrive in either `url` or `site`
  const direct = rawUrl || (/^https?:\/\/|\.[a-z]{2,}/i.test(rawSite) ? rawSite : '')
  if (direct) {
    const full = /^https?:\/\//i.test(direct) ? direct : `https://${direct}`
    if (!real && /youtube\.com|youtu\.be/i.test(full)) return YT_HOME
    return full
  }

  const site = rawSite.toLowerCase()
  if (site.includes('portfolio')) return PORTFOLIO
  if (real) {
    // real Chrome windows get normal URLs — no iframe workarounds
    if (site.includes('youtube')) return query ? `https://www.youtube.com/results?search_query=${enc}` : 'https://www.youtube.com'
    if (site.includes('wikipedia')) return query ? `https://en.wikipedia.org/wiki/Special:Search?search=${enc}` : 'https://www.wikipedia.org'
    if (/portfolio/i.test(query)) return PORTFOLIO
    return query ? `https://www.google.com/search?q=${enc}` : 'https://www.google.com'
  }
  if (site.includes('youtube')) return query ? `https://www.google.com/search?igu=1&q=${enc}+youtube` : YT_HOME
  if (site.includes('wikipedia')) return query ? `https://en.wikipedia.org/wiki/Special:Search?search=${enc}` : 'https://www.wikipedia.org'
  if (/portfolio/i.test(query)) return PORTFOLIO
  return query ? `https://www.google.com/search?igu=1&q=${enc}` : HOME
}

export default function App() {
  const [state, setStateRaw] = useState<OrbState>('breathing')
  const stateNonce = useRef(0)
  const [, forceTick] = useState(0)

  // setting a state (even the same one) resets the idle timer
  const setState = (s: OrbState) => {
    stateNonce.current++
    setStateRaw(s)
    forceTick((n) => n + 1)
  }

  const [browser, setBrowser] = useState<{ open: boolean; url: string; position: Anchor }>({
    open: false,
    url: HOME,
    position: 'center',
  })
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [booted, setBooted] = useState(false)
  const [panel, setPanel] = useState<PanelName | null>(null)
  const [panelClosing, setPanelClosing] = useState(false)
  const shadowRef = useRef<HTMLDivElement>(null)

  // one side panel at a time: same button = animated close, other = instant switch
  const selectPanel = (name: PanelName) => {
    if (panel === name && !panelClosing) setPanelClosing(true)
    else {
      setPanel(name)
      setPanelClosing(false)
    }
  }
  const panelClosed = () => {
    setPanel(null)
    setPanelClosing(false)
  }
  const panelProps = {
    closing: panelClosing,
    onRequestClose: () => setPanelClosing(true),
    onClosed: panelClosed,
  }

  // live feed: news poller + server/network watchers (idempotent)
  useEffect(() => {
    initFeedSources()
  }, [])

  // failsafe: whatever happens, the core always drifts home to breathing —
  // but never while Jarvis is still speaking (long answers keep the talking state)
  useEffect(() => {
    if (state === 'breathing') return
    let id: number
    const arm = (ms: number) => {
      id = window.setTimeout(() => {
        if (isSpeaking()) arm(1500)
        else setStateRaw('breathing')
      }, ms)
    }
    arm(12000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, stateNonce.current])

  // boot sequence: HUD assembles once the boot overlay clears
  useEffect(() => {
    if (!booted) return
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
    tl.from('.hud-top', { y: -64, opacity: 0, duration: 0.6 })
      .from('.sidebar', { x: -72, opacity: 0, duration: 0.5 }, '-=0.32')
      .from('.info-cards .card', { y: 28, opacity: 0, stagger: 0.1, duration: 0.45 }, '-=0.25')
    // revert (not kill) so StrictMode's double-run leaves no stuck inline styles
    return () => {
      tl.revert()
    }
  }, [booted])

  const executeUICommand = (name: string, args: Record<string, unknown>): string | Promise<string> => {
    const realChrome = getSettings().browserMode === 'real'
    switch (name) {
      case 'open_browser': {
        const url = resolveUrl(args, realChrome)
        const position = normalizeAnchor(args.position)
        if (realChrome) return openRealBrowser(url, position)
        setBrowser({ open: true, url, position })
        return `Browser window opened at ${position} showing ${url}`
      }
      case 'move_browser': {
        const position = normalizeAnchor(args.position)
        if (realChrome) return moveRealBrowser(position)
        if (!browser.open) return 'No browser window is open.'
        setBrowser((b) => ({ ...b, position }))
        return `Browser window moved to ${position}`
      }
      case 'close_browser':
        if (realChrome) return closeRealBrowser()
        setBrowser((b) => ({ ...b, open: false }))
        return 'Browser window closed.'
      case 'set_protocol_state': {
        const s = args.state as OrbState
        if (!STATES.includes(s)) return `Unknown state ${s}`
        setState(s)
        return `Protocol state set to ${s}`
      }
      case 'add_note': {
        const text = String(args.text ?? '').trim()
        if (!text) return 'Nothing to note.'
        addFeedItem({ kind: 'note', title: text })
        return `Noted and saved to the feed: "${text}"`
      }
      case 'check_mail': {
        setPanel('mail')
        setPanelClosing(false)
        return mailSummaryForChat()
      }
      default:
        return `Unknown tool ${name}`
    }
  }

  return (
    <div className="stage">
      <Canvas
        className="stage-canvas"
        camera={{ position: [0, 0, 5.6], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <JarvisBlob state={state} shadowRef={shadowRef} />
      </Canvas>
      <div className="hex-wrap" aria-hidden>
        <div ref={shadowRef} className="pedestal-glow" />
      </div>
      {!booted && <BootOverlay onDone={() => setBooted(true)} />}
      {booted && (
        <>
          <HudBar
            state={state}
            onSelectState={setState}
          />
          <Sidebar
            browserOpen={browser.open}
            consoleOpen={consoleOpen}
            activePanel={panelClosing ? null : panel}
            onToggleBrowser={() => setBrowser((b) => ({ ...b, open: !b.open }))}
            onToggleConsole={() => setConsoleOpen((v) => !v)}
            onSelectPanel={selectPanel}
          />
          <InfoCards />
          {panel === 'feed' && (
            <FeedPanel
              {...panelProps}
              onOpenLink={(url) => setBrowser({ open: true, url, position: 'center' })}
            />
          )}
          {panel === 'mail' && <MailPanel {...panelProps} />}
          {panel === 'memory' && <MemoryPanel {...panelProps} />}
          {panel === 'system' && <SystemPanel {...panelProps} />}
          {panel === 'network' && <NetworkPanel {...panelProps} />}
          {panel === 'tools' && <ToolsPanel {...panelProps} executeUICommand={executeUICommand} />}
          {panel === 'settings' && <SettingsPanel {...panelProps} />}
          <Console
            state={state}
            hidden={!consoleOpen}
            onRequestOpen={() => setConsoleOpen(true)}
            onOpenBrowser={(url) => setBrowser({ open: true, url, position: 'center' })}
            onStateChange={setState}
            executeUICommand={executeUICommand}
            onCollapse={() => setConsoleOpen(false)}
          />
          {!consoleOpen && (
            <button type="button" className="console-tab" onClick={() => setConsoleOpen(true)}>
              ❮ NEURAL LINK
            </button>
          )}
          {browser.open && (
            <BrowserWindow
              url={browser.url}
              position={browser.position}
              onClose={() => setBrowser((b) => ({ ...b, open: false }))}
            />
          )}
        </>
      )}
    </div>
  )
}
