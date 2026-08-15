import { useState } from 'react'
import SidePanel from './SidePanel'
import { getSettings, setSetting, ALL_NEWS_CATS } from '../lib/settings'
import { PROVIDERS } from '../lib/llm'
import { clearFeed } from '../lib/feed'
import { clearChatLog } from '../lib/memlog'

interface Props {
  closing: boolean
  onRequestClose: () => void
  onClosed: () => void
}

export default function SettingsPanel(props: Props) {
  const [settings, setSettings] = useState(getSettings)
  const [flash, setFlash] = useState('')

  const update = <K extends keyof ReturnType<typeof getSettings>>(key: K, value: ReturnType<typeof getSettings>[K]) => {
    setSetting(key, value)
    setSettings(getSettings())
  }

  const toggleCat = (cat: string) => {
    const cats = settings.newsCats.includes(cat)
      ? settings.newsCats.filter((c) => c !== cat)
      : [...settings.newsCats, cat]
    update('newsCats', cats)
  }

  const note = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(''), 2500)
  }

  return (
    <SidePanel title="SETTINGS" {...props}>
      <p className="settings-group">VOICE OUTPUT (DEFAULT)</p>
      <div className="settings-chips">
        <button type="button" className={`feed-chip${settings.voiceOn ? ' active' : ''}`} onClick={() => update('voiceOn', true)}>
          ON
        </button>
        <button type="button" className={`feed-chip${!settings.voiceOn ? ' active' : ''}`} onClick={() => update('voiceOn', false)}>
          OFF
        </button>
      </div>

      <p className="settings-group">"HEY JARVIS" WAKE WORD</p>
      <div className="settings-chips">
        <button type="button" className={`feed-chip${settings.wakeOn ? ' active' : ''}`} onClick={() => update('wakeOn', true)}>
          ON
        </button>
        <button type="button" className={`feed-chip${!settings.wakeOn ? ' active' : ''}`} onClick={() => update('wakeOn', false)}>
          OFF
        </button>
      </div>

      <p className="settings-group">BROWSER WINDOWS</p>
      <div className="settings-chips">
        <button
          type="button"
          className={`feed-chip${settings.browserMode === 'real' ? ' active' : ''}`}
          onClick={() => update('browserMode', 'real')}
        >
          REAL CHROME
        </button>
        <button
          type="button"
          className={`feed-chip${settings.browserMode === 'embedded' ? ' active' : ''}`}
          onClick={() => update('browserMode', 'embedded')}
        >
          EMBEDDED
        </button>
      </div>

      <p className="settings-group">DEFAULT MODEL</p>
      <div className="settings-chips">
        <button
          type="button"
          className={`feed-chip${settings.defaultMode === 'auto' ? ' active' : ''}`}
          onClick={() => update('defaultMode', 'auto')}
        >
          AUTO
        </button>
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`feed-chip${settings.defaultMode === p.id ? ' active' : ''}`}
            onClick={() => update('defaultMode', p.id)}
          >
            {p.short}
          </button>
        ))}
      </div>

      <p className="settings-group">NEWS CATEGORIES</p>
      <div className="settings-chips wrap">
        {ALL_NEWS_CATS.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`feed-chip${settings.newsCats.includes(cat) ? ' active' : ''}`}
            onClick={() => toggleCat(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <p className="settings-group">DATA CONTROLS</p>
      <div className="settings-chips">
        <button
          type="button"
          className="feed-chip"
          onClick={() => {
            clearFeed()
            note('Feed history wiped.')
          }}
        >
          CLEAR FEED
        </button>
        <button
          type="button"
          className="feed-chip"
          onClick={() => {
            clearChatLog()
            note('Conversation memory wiped.')
          }}
        >
          CLEAR MEMORY
        </button>
      </div>

      {flash && <p className="tool-result">{flash}</p>}
      <p className="settings-note">Voice & model defaults apply on next reload. News categories apply on the next poll.</p>
    </SidePanel>
  )
}
