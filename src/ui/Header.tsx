import { useEffect } from 'react'
import { countsOf, exportNotes, hydrateParsedDocs, loadDemoPair, useRoom } from '../room/store'
import { ROOM_TOOLS } from '../webmcp/tools'

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
              Agent clears mechanical noise. Breaking changes wait on you. Export only
              what is settled or human-acked.
            </p>
          </div>
        </div>
        <div className="header-meta">
          <span className={room.webmcpPresent ? 'pill pill-ok' : 'pill pill-warn'}>
            {room.webmcpPresent
              ? `WebMCP connected · ${room.webmcpToolCount} tools`
              : `WebMCP missing · ${ROOM_TOOLS.length} tools idle`}
          </span>
          <span className="pill">
            {counts.settled + counts.safe + counts.acked} settled
          </span>
          <span className={counts.waiting ? 'pill pill-wait' : 'pill'}>
            {counts.waiting} waiting
          </span>
        </div>
      </div>
      <div className="header-actions">
        <button type="button" className="btn btn-primary" onClick={() => loadDemoPair()}>
          Load demo pair
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
        <details className="judge">
          <summary>60s judge path</summary>
          <ol>
            <li>Open this URL in ChatGPT’s in-app browser or Chrome with <code>#enable-webmcp-testing</code>.</li>
            <li>Click <strong>Load demo pair</strong>.</li>
            <li>Ask: “Classify this OpenAPI diff and summarize what you settled vs what waits on me.”</li>
            <li>On one waiting card, click <strong>Mark intentional (breaking)</strong>.</li>
            <li>Ask: “list_room then export_migration_notes.”</li>
            <li>Export refuses while any waiting cards remain; it succeeds only after they are human-acked.</li>
          </ol>
        </details>
      </div>
    </header>
  )
}
