import { useState } from 'react'
import SidePanel from './SidePanel'
import type { ToolExecutor } from '../lib/llm'

interface Props {
  closing: boolean
  onRequestClose: () => void
  onClosed: () => void
  executeUICommand: ToolExecutor
}

const REGISTRY: { icon: string; name: string; desc: string; run?: { label: string; args: Record<string, unknown> } }[] = [
  {
    icon: '⌂',
    name: 'open_browser',
    desc: 'Opens the embedded browser at any screen anchor, with site or search query.',
    run: { label: 'RUN', args: { site: 'google', position: 'center' } },
  },
  { icon: '⇢', name: 'move_browser', desc: 'Flies the browser window to another corner.' },
  {
    icon: '✕',
    name: 'close_browser',
    desc: 'Closes the embedded browser window.',
    run: { label: 'RUN', args: {} },
  },
  { icon: '◍', name: 'set_protocol_state', desc: "Switches the particle core's visual protocol." },
  { icon: '✎', name: 'add_note', desc: 'Saves a personal note or reminder into the live feed.' },
  {
    icon: '✉',
    name: 'check_mail',
    desc: 'Checks the Gmail inbox and reports unread mail.',
    run: { label: 'RUN', args: {} },
  },
]

export default function ToolsPanel({ executeUICommand, ...props }: Props) {
  const [result, setResult] = useState('')

  const run = async (name: string, args: Record<string, unknown>) => {
    setResult('…')
    try {
      setResult(await executeUICommand(name, args))
    } catch (err) {
      setResult(`Failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  return (
    <SidePanel title="TOOL ARSENAL" {...props}>
      {REGISTRY.map((t, i) => (
        <div key={t.name} className="tool-row" style={{ animationDelay: `${i * 0.04}s` }}>
          <span className="feed-icon">{t.icon}</span>
          <div className="feed-body">
            <p className="feed-title">
              {t.name} <em className="tool-status">OPERATIONAL</em>
            </p>
            <span className="feed-meta">{t.desc}</span>
          </div>
          {t.run && (
            <button type="button" className="feed-btn tool-run" onClick={() => run(t.name, t.run!.args)}>
              {t.run.label}
            </button>
          )}
        </div>
      ))}
      {result && <p className="tool-result">{result}</p>}
    </SidePanel>
  )
}
