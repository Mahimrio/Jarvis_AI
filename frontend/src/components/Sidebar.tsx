import { useFeed } from '../lib/feed'
import { useMailUnread } from '../lib/mail'

interface Props {
  browserOpen: boolean
  consoleOpen: boolean
  feedOpen: boolean
  mailOpen: boolean
  onToggleBrowser: () => void
  onToggleConsole: () => void
  onToggleFeed: () => void
  onToggleMail: () => void
}

const PASSIVE_ITEMS = ['MEMORY', 'SYSTEM', 'NETWORK', 'TOOLS', 'SETTINGS'] as const
const ICONS: Record<string, string> = {
  MEMORY: '◈',
  SYSTEM: '⬡',
  NETWORK: '⇌',
  TOOLS: '⚒',
  SETTINGS: '⚙',
}

export default function Sidebar({ browserOpen, consoleOpen, feedOpen, mailOpen, onToggleBrowser, onToggleConsole, onToggleFeed, onToggleMail }: Props) {
  const { unread } = useFeed()
  const mailUnread = useMailUnread()
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
      <button
        type="button"
        className={`side-btn${feedOpen ? ' active' : ''}`}
        onClick={onToggleFeed}
      >
        <span className="side-icon">▤</span>
        <span className="side-label">FEED</span>
        {unread > 0 && !feedOpen && <span className="feed-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      <button
        type="button"
        className={`side-btn${mailOpen ? ' active' : ''}`}
        onClick={onToggleMail}
      >
        <span className="side-icon">✉</span>
        <span className="side-label">MAIL</span>
        {mailUnread > 0 && !mailOpen && <span className="feed-badge">{mailUnread > 99 ? '99+' : mailUnread}</span>}
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
