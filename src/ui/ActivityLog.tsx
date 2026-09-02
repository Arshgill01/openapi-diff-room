import { useRoom } from '../room/store'

export function ActivityLog() {
  const room = useRoom()
  return (
    <section className="log" aria-label="Activity log">
      <h2>Activity</h2>
      {room.activity.length === 0 ? (
        <p className="muted">Tool calls and human decisions will list here.</p>
      ) : (
        <ul>
          {room.activity.map((entry) => (
            <li key={entry.id}>
              <time dateTime={entry.at}>{formatTime(entry.at)}</time>
              <span className={`kind kind-${entry.kind}`}>{entry.kind}</span>
              <span className="log-title">{entry.title}</span>
              {entry.detail ? <span className="muted">{entry.detail}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}
