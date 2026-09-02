import { useEffect, useState } from 'react'
import { classifyDiff, useRoom } from './room/store'
import { registerRoomTools } from './webmcp/register'
import { Header } from './ui/Header'
import { SpecPanes } from './ui/SpecPanes'
import { RoomPane } from './ui/RoomPane'
import { ActivityLog } from './ui/ActivityLog'

export default function App() {
  const room = useRoom()
  const [tab, setTab] = useState<'old' | 'new' | 'room'>('room')

  useEffect(() => {
    const controller = new AbortController()
    void registerRoomTools(controller.signal)
    return () => controller.abort()
  }, [])

  return (
    <div className="shell">
      {!room.webmcpPresent && (
        <div className="banner" role="status">
          WebMCP is not available in this browser (<code>document.modelContext</code> missing).
          Classify and export still work from the buttons on this page. Open in Chrome with{' '}
          <code>#enable-webmcp-testing</code> or ChatGPT’s in-app browser to expose tools.
        </div>
      )}
      <Header onClassify={() => classifyDiff()} />
      {(room.parseError || room.parseWarning || room.exportError) && (
        <div className="notices">
          {room.parseError ? <p className="notice notice-err">{room.parseError}</p> : null}
          {room.parseWarning ? <p className="notice">{room.parseWarning}</p> : null}
          {room.exportError ? <p className="notice notice-err">{room.exportError}</p> : null}
        </div>
      )}
      {room.exportMarkdown && !room.exportError && (
        <details className="export-preview" open>
          <summary>Migration notes (copy or download from Export notes)</summary>
          <pre>{room.exportMarkdown}</pre>
        </details>
      )}
      <nav className="mobile-tabs" aria-label="Panes">
        {(['old', 'new', 'room'] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'is-on' : ''}
            onClick={() => setTab(id)}
          >
            {id === 'old' ? 'Old spec' : id === 'new' ? 'New spec' : 'Room'}
          </button>
        ))}
      </nav>
      <main className="workspace">
        <SpecPanes mobileTab={tab} />
        <RoomPane mobileTab={tab} />
      </main>
      <ActivityLog />
    </div>
  )
}
