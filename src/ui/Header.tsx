import { useEffect } from 'react'
import {
  countsOf,
  exportNotes,
  hydrateParsedDocs,
  loadFixture,
  simulateAgentSettleAttempt,
  useRoom,
} from '../room/store'
import { ALWAYS_ON_TOOLS, SCOPED_TOOLS } from '../webmcp/tools'

type HeaderProps = {
  onClassify: () => void
}

export function Header({ onClassify }: HeaderProps) {
  const room = useRoom()
  const counts = countsOf(room.cases)

  useEffect(() => {
    hydrateParsedDocs()
  }, [])

  return (
    <header className="header">
      <div className="header-row">
        <div className="brand">
          <div className="mark" aria-hidden="true" />
          <div>
            <h1>OpenAPI Diff Room</h1>
            <p className="tagline">
              Agent clears mechanical OpenAPI noise. Breaking waits on you. Export is
              blocked until every break is human-acked — counts only for the rest.
            </p>
          </div>
        </div>
        <div className="header-meta">
          <span className={room.webmcpPresent ? 'pill pill-ok' : 'pill pill-warn'}>
            {room.webmcpPresent
              ? `WebMCP connected · ${room.webmcpToolCount} tools`
              : `WebMCP missing · ${ALWAYS_ON_TOOLS.length} always-on idle`}
          </span>
          <span className="pill">
            {ALWAYS_ON_TOOLS.length} always-on
            {room.oldText.trim() && room.newText.trim() ? ` · ${SCOPED_TOOLS.length} scoped` : ''}
          </span>
          <span className="pill">{counts.settled + counts.safe} mechanical</span>
          <span className={counts.waiting ? 'pill pill-wait' : 'pill'}>{counts.waiting} waiting</span>
          <span className="pill">{counts.acked} acked</span>
        </div>
      </div>
      <div className="header-actions">
        <button type="button" className="btn btn-primary" onClick={() => loadFixture('demo')}>
          Load demo pair
        </button>
        <button type="button" className="btn" onClick={() => loadFixture('injection')}>
          Load injection fixture
        </button>
        <button type="button" className="btn" onClick={onClassify}>
          Classify diff
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const result = exportNotes()
            if (result.ok) {
              const blob = new Blob([result.markdown], { type: 'text/markdown' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'openapi-migration-notes.md'
              a.click()
              URL.revokeObjectURL(url)
            }
          }}
        >
          Export notes
        </button>
        <button type="button" className="btn btn-break" onClick={() => simulateAgentSettleAttempt()}>
          Simulate agent take_new
        </button>
        <details className="judge">
          <summary>60s judge path</summary>
          <ol>
            <li>Open this URL in ChatGPT’s in-app browser or Chrome with <code>#enable-webmcp-testing</code>.</li>
            <li>Click <strong>Load demo pair</strong>.</li>
            <li>Ask: “Classify this OpenAPI diff and summarize what you settled vs what waits on me.”</li>
            <li>Watch mechanical settle (green) and breaking wait (cards). No tool can Take new.</li>
            <li>On one waiting card, click <strong>Mark intentional (breaking)</strong>.</li>
            <li>Ask <code>export_migration_notes</code>. It returns <code>BLOCKED_UNSETTLED</code> until every remaining break is human-acked.</li>
            <li>Ack the rest, export again: notes list acked breaks in full and mechanical <em>counts only</em>.</li>
            <li>Click <strong>Load injection fixture</strong>. Classify still waits on the removed endpoint; the page stamps that the “auto-approve” payload was ignored. Optional: <strong>Simulate agent take_new</strong> → <code>REQUIRES_HUMAN</code>.</li>
          </ol>
        </details>
      </div>
    </header>
  )
}
