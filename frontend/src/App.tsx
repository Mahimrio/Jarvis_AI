import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import JarvisBlob from './components/JarvisBlob'
import HudBar from './components/HudBar'
import ProtocolBar from './components/ProtocolBar'
import Console from './components/Console'
import BrowserWindow, { type Anchor } from './components/BrowserWindow'
import Sidebar from './components/Sidebar'
import InfoCards from './components/InfoCards'
import { STATES, type OrbState } from './components/states'

const HOME = 'https://www.google.com/webhp?igu=1'
const YT_HOME = 'https://www.youtube.com/embed/videoseries?list=UUsooa4yRKGN_zEE8iknghZA'

function resolveUrl(args: Record<string, unknown>): string {
  const url = typeof args.url === 'string' ? args.url.trim() : ''
  if (url) return /^https?:\/\//i.test(url) ? url : `https://${url}`
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  const enc = encodeURIComponent(query)
  switch (args.site) {
    case 'youtube':
      return query ? `https://www.google.com/search?igu=1&q=${enc}+youtube` : YT_HOME
    case 'wikipedia':
      return query ? `https://en.wikipedia.org/wiki/Special:Search?search=${enc}` : 'https://www.wikipedia.org'
    default:
      return query ? `https://www.google.com/search?igu=1&q=${enc}` : HOME
  }
}

export default function App() {
  const [state, setState] = useState<OrbState>('breathing')
  const [browser, setBrowser] = useState<{ open: boolean; url: string; position: Anchor }>({
    open: false,
    url: HOME,
    position: 'center',
  })
  const [consoleOpen, setConsoleOpen] = useState(true)

  const executeUICommand = (name: string, args: Record<string, unknown>): string => {
    switch (name) {
      case 'open_browser': {
        const url = resolveUrl(args)
        const position = (args.position as Anchor) ?? 'center'
        setBrowser({ open: true, url, position })
        return `Browser window opened at ${position} showing ${url}`
      }
      case 'move_browser': {
        if (!browser.open) return 'No browser window is open.'
        const position = args.position as Anchor
        setBrowser((b) => ({ ...b, position }))
        return `Browser window moved to ${position}`
      }
      case 'close_browser':
        setBrowser((b) => ({ ...b, open: false }))
        return 'Browser window closed.'
      case 'set_protocol_state': {
        const s = args.state as OrbState
        if (!STATES.includes(s)) return `Unknown state ${s}`
        setState(s)
        return `Protocol state set to ${s}`
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
        <JarvisBlob state={state} />
      </Canvas>
      <div className="hex-wrap" aria-hidden>
        <svg className="hex-frame" viewBox="0 0 100 115">
          <polygon points="50,2 97,30 97,86 50,113 3,86 3,30" />
          <polygon className="hex-inner" points="50,7 93,33 93,83 50,109 7,83 7,33" />
        </svg>
        <div className="pedestal-glow" />
      </div>
      <HudBar
        state={state}
        onToggleBrowser={() => setBrowser((b) => ({ ...b, open: !b.open }))}
      />
      <Sidebar
        browserOpen={browser.open}
        consoleOpen={consoleOpen}
        onToggleBrowser={() => setBrowser((b) => ({ ...b, open: !b.open }))}
        onToggleConsole={() => setConsoleOpen((v) => !v)}
      />
      <InfoCards />
      {consoleOpen && (
        <Console
          state={state}
          onOpenBrowser={(url) => setBrowser({ open: true, url })}
          onStateChange={setState}
          executeUICommand={executeUICommand}
        />
      )}
      {browser.open && (
        <BrowserWindow
          url={browser.url}
          position={browser.position}
          onClose={() => setBrowser((b) => ({ ...b, open: false }))}
        />
      )}
      <ProtocolBar state={state} onSelect={setState} />
    </div>
  )
}
