import { STATES, type OrbState } from './states'

interface Props {
  state: OrbState
  onSelect: (s: OrbState) => void
}

export default function ProtocolBar({ state, onSelect }: Props) {
  return (
    <footer className="protocol-bar">
      <span className="protocol-label">PROTOCOL STATE:</span>
      {STATES.map((s) => (
        <button
          key={s}
          type="button"
          className={`protocol-chip${s === state ? ' active' : ''}`}
          onClick={() => onSelect(s)}
        >
          ● {s.toUpperCase()}
        </button>
      ))}
    </footer>
  )
}
