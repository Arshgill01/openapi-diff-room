import { setSpecText, useRoom } from '../room/store'

type SpecPanesProps = {
  mobileTab: 'old' | 'new' | 'room'
}

export function SpecPanes({ mobileTab }: SpecPanesProps) {
  const room = useRoom()
  return (
    <>
      <section className={`pane ${mobileTab === 'old' ? 'is-active' : ''}`} aria-label="Old spec">
        <div className="pane-head">
          <h2>Old spec</h2>
          <span className="muted">OpenAPI 3.x YAML or JSON</span>
        </div>
        <textarea
          className="spec"
          spellCheck={false}
          value={room.oldText}
          onChange={(e) => setSpecText('old', e.target.value)}
          placeholder="Paste the previous OpenAPI document…"
        />
      </section>
      <section className={`pane ${mobileTab === 'new' ? 'is-active' : ''}`} aria-label="New spec">
        <div className="pane-head">
          <h2>New spec</h2>
          <span className="muted">OpenAPI 3.x YAML or JSON</span>
        </div>
        <textarea
          className="spec"
          spellCheck={false}
          value={room.newText}
          onChange={(e) => setSpecText('new', e.target.value)}
          placeholder="Paste the proposed OpenAPI document…"
        />
      </section>
    </>
  )
}
