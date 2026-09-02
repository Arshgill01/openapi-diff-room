import type { DiffCase } from '../types'
import { getRule } from '../diff/rules'
import { humanSettle } from '../room/store'

type WaitingCardProps = {
  item: DiffCase
  focused: boolean
  pulse?: boolean
}

export function WaitingCard({ item, focused, pulse }: WaitingCardProps) {
  const rule = getRule(item.ruleId)
  return (
    <article
      className={`card ${focused ? 'is-focused' : ''} ${pulse ? 'is-refused-pulse' : ''}`}
      id={`case-${cssId(item.id)}`}
      data-case-id={item.id}
    >
      <header className="card-head">
        <div>
          <div className="op">
            {item.method === 'SCHEMA' ? item.path : `${item.method} ${item.path}`}
          </div>
          <div className="why">{item.why}</div>
        </div>
        <div className="badges">
          <span className={`badge badge-${rule.severity}`}>{rule.id}</span>
          <span className="badge">{rule.severity}</span>
        </div>
      </header>
      <div className="snippets">
        <pre>
          <span className="snip-label">Old</span>
          {item.oldSnippet}
        </pre>
        <pre>
          <span className="snip-label">New</span>
          {item.newSnippet}
        </pre>
      </div>
      <div className="card-actions">
        <button type="button" className="btn" onClick={() => humanSettle(item.id, 'old')}>
          Take old
        </button>
        <button type="button" className="btn" onClick={() => humanSettle(item.id, 'new')}>
          Take new
        </button>
        <button
          type="button"
          className="btn btn-break"
          onClick={() => humanSettle(item.id, 'intentional')}
        >
          Mark intentional (breaking)
        </button>
      </div>
    </article>
  )
}

export function cssId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}
