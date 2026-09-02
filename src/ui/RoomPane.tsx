import { useEffect } from 'react'
import { HUMAN_ACKED } from '../types'
import { countsOf, useRoom } from '../room/store'
import { getRule } from '../diff/rules'
import { cssId, WaitingCard } from './WaitingCard'

type RoomPaneProps = {
  mobileTab: 'old' | 'new' | 'room'
}

export function RoomPane({ mobileTab }: RoomPaneProps) {
  const room = useRoom()
  const counts = countsOf(room.cases)
  const waiting = room.cases.filter((c) => c.status === 'waiting')
  const safe = room.cases.filter((c) => c.status === 'safe-additive')
  const settled = room.cases.filter((c) => c.status === 'auto-settled')
  const acked = room.cases.filter((c) => HUMAN_ACKED.includes(c.status))

  useEffect(() => {
    if (!room.focusedId) return
    const el = document.getElementById(`case-${cssId(room.focusedId)}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [room.focusedId])

  return (
    <section className={`pane room-pane ${mobileTab === 'room' ? 'is-active' : ''}`} aria-label="Room">
      <div className="pane-head">
        <h2>Room</h2>
        <span className="muted">
          {counts.waiting} waiting · {counts.settled} mechanical · {counts.safe} safe · {counts.acked} acked
        </span>
      </div>
      <div className="room-scroll">
        {!room.cases.length && !room.parseError && (
          <p className="empty">
            Load the demo pair or paste two specs, then classify. Mechanical edits settle
            themselves. Breaking and ambiguous changes wait here for a human.
          </p>
        )}
        {waiting.length > 0 && (
          <div className="stack">
            <h3>Waiting on you</h3>
            {waiting.map((item) => (
              <WaitingCard key={item.id} item={item} focused={room.focusedId === item.id} />
            ))}
          </div>
        )}
        {acked.length > 0 && (
          <div className="stack">
            <h3>Human-acked</h3>
            {acked.map((item) => (
              <div
                key={item.id}
                className={`row ${room.focusedId === item.id ? 'is-focused' : ''}`}
                id={`case-${cssId(item.id)}`}
              >
                <span className={`dot dot-${item.status}`} />
                <div>
                  <div className="op small">
                    {item.method === 'SCHEMA' ? item.path : `${item.method} ${item.path}`}
                  </div>
                  <div className="muted">
                    {getRule(item.ruleId).id} · {ackLabel(item.status)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {safe.length > 0 && (
          <div className="stack">
            <h3>Safe additive</h3>
            {safe.map((item) => (
              <div
                key={item.id}
                className={`row row-safe ${room.focusedId === item.id ? 'is-focused' : ''}`}
                id={`case-${cssId(item.id)}`}
              >
                <span className="dot dot-safe" />
                <div>
                  <div className="op small">
                    {item.method === 'SCHEMA' ? item.path : `${item.method} ${item.path}`}
                  </div>
                  <div className="muted">{getRule(item.ruleId).id}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {settled.length > 0 && (
          <div className="stack">
            <h3>Mechanical settled</h3>
            {settled.map((item) => (
              <div
                key={item.id}
                className={`row row-settled ${room.focusedId === item.id ? 'is-focused' : ''}`}
                id={`case-${cssId(item.id)}`}
              >
                <span className="dot dot-settled" />
                <div>
                  <div className="op small">
                    {item.method === 'SCHEMA' ? item.path : `${item.method} ${item.path}`}
                  </div>
                  <div className="muted">{getRule(item.ruleId).id}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function ackLabel(status: string): string {
  if (status === 'acked-old') return 'Take old'
  if (status === 'acked-new') return 'Take new'
  return 'Intentional break'
}
