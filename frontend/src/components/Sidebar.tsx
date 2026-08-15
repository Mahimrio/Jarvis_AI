import { useFeed } from '../lib/feed'
import { useMailUnread } from '../lib/mail'

export type PanelName = 'feed' | 'mail' | 'memory' | 'system' | 'network' | 'tools' | 'settings'

interface Props {
  browserOpen: boolean
  consoleOpen: boolean
  activePanel: PanelName | null
  onToggleBrowser: () => void
  onToggleConsole: () => void
  onSelectPanel: (name: PanelName) => void
}

const MODULES: { name: PanelName; icon: string; label: string }[] = [
  { name: 'feed', icon: '▤', label: 'FEED' },
  { name: 'mail', icon: '✉', label: 'MAIL' },
  { name: 'memory', icon: '◈', label: 'MEMORY' },
  { name: 'system', icon: '⬡', label: 'SYSTEM' },
  { name: 'network', icon: '⇌', label: 'NETWORK' },
  { name: 'tools', icon: '⚒', label: 'TOOLS' },
  { name: 'settings', icon: '⚙', label: 'SETTINGS' },
]

export default function Sidebar({ browserOpen, consoleOpen, activePanel, onToggleBrowser, onToggleConsole, onSelectPanel }: Props) {
  const { unread } = useFeed()
  const mailUnread = useMailUnread()
  const badgeFor = (name: PanelName) =>
    name === 'feed' ? unread : name === 'mail' ? mailUnread : 0

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
      {MODULES.map((m) => {
        const badge = badgeFor(m.name)
        const active = activePanel === m.name
        return (
          <button
            key={m.name}
            type="button"
            className={`side-btn${active ? ' active' : ''}`}
            onClick={() => onSelectPanel(m.name)}
          >
            <span className="side-icon">{m.icon}</span>
            <span className="side-label">{m.label}</span>
            {badge > 0 && !active && <span className="feed-badge">{badge > 99 ? '99+' : badge}</span>}
          </button>
        )
      })}
    </nav>
  )
}
