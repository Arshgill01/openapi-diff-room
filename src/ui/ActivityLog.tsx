import { useRoom } from '../room/store'

export function ActivityLog() {
  const room = useRoom()
  return (
    <section className="log" aria-label="Call and refusal log">
      <h2>Call / refusal log</h2>
      {room.activity.length === 0 ? (
        <p className="muted">Every tool call (args, accepted/refused, rule or code) lists here.</p>
      ) : (
        <div className="log-table-wrap">
          <table className="log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Who</th>
                <th>Call</th>
                <th>Args</th>
                <th>Result</th>
                <th>Code / rule</th>
              </tr>
            </thead>
            <tbody>
              {room.activity.map((entry) => (
                <tr key={entry.id} className={entry.outcome === 'refused' ? 'is-refused' : ''}>
                  <td>
                    <time dateTime={entry.at}>{formatTime(entry.at)}</time>
                  </td>
                  <td>
                    <span className={`kind kind-${entry.kind}`}>{entry.kind}</span>
                  </td>
                  <td className="log-title">{entry.tool ?? entry.title}</td>
                  <td className="mono muted">{entry.argsSummary ?? '—'}</td>
                  <td>
                    <span className={`outcome outcome-${entry.outcome}`}>{entry.outcome}</span>
                  </td>
                  <td className="mono">{entry.code ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
