interface Props {
  browserOpen: boolean
  consoleOpen: boolean
  onToggleBrowser: () => void
  onToggleConsole: () => void
}

const PASSIVE_ITEMS = ['MEMORY', 'SYSTEM', 'NETWORK', 'TOOLS', 'SETTINGS'] as const
const ICONS: Record<string, string> = {
  MEMORY: '◈',
  SYSTEM: '⬡',
  NETWORK: '⇌',
  TOOLS: '⚒',
  SETTINGS: '⚙',
}

export default function Sidebar({ browserOpen, consoleOpen, onToggleBrowser, onToggleConsole }: Props) {
  return (
    <nav className="sidebar">
      <button
        type="button"
        className={`side-btn${browserOpen ? ' active' : ''}`}
        onClick={onToggleBrowser}
      >
        <span className="side-icon">⌂</span>
        <span className="side-label">BROWSER</span>
      </button>
      <button
        type="button"
        className={`side-btn${consoleOpen ? ' active' : ''}`}
        onClick={onToggleConsole}
      >
        <span className="side-icon">⌨</span>
        <span className="side-label">CONSOLE</span>
      </button>
      {PASSIVE_ITEMS.map((name) => (
        <button key={name} type="button" className="side-btn dormant" title="Module offline">
          <span className="side-icon">{ICONS[name]}</span>
          <span className="side-label">{name}</span>
        </button>
      ))}
    </nav>
  )
}
