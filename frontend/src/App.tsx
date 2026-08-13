import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import JarvisBlob from './components/JarvisBlob'
import HudBar from './components/HudBar'
import ProtocolBar from './components/ProtocolBar'
import Console from './components/Console'
import BrowserWindow from './components/BrowserWindow'
import Sidebar from './components/Sidebar'
import InfoCards from './components/InfoCards'
import type { OrbState } from './components/states'

const HOME = 'https://www.google.com/webhp?igu=1'

export default function App() {
  const [state, setState] = useState<OrbState>('breathing')
  const [browser, setBrowser] = useState<{ open: boolean; url: string }>({ open: false, url: HOME })
  const [consoleOpen, setConsoleOpen] = useState(true)

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
        />
      )}
      {browser.open && (
        <BrowserWindow url={browser.url} onClose={() => setBrowser((b) => ({ ...b, open: false }))} />
      )}
      <ProtocolBar state={state} onSelect={setState} />
    </div>
  )
}
