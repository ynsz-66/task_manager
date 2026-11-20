import { useEffect, useRef, useState } from 'react'
import type { Stats } from '../types'
import { taskStorage } from '../services/taskStorage'
import { fillDays } from '../dueDate'

const DAYS = 30
// Chart geometry (SVG units, scaled to the dialog width).
const WIDTH = 360
const HEIGHT = 96
const SLOT = WIDTH / DAYS
const GAP = 2
const RADIUS = 2

/** A bar rounded on its top end only, standing on the baseline. */
function barPath(x: number, width: number, height: number) {
  const r = Math.min(RADIUS, height, width / 2)
  const top = HEIGHT - height
  return `M${x},${HEIGHT}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${HEIGHT}Z`
}

const dayName = (date: Date) => date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

function DoneChart({ days }: { days: ReturnType<typeof fillDays> }) {
  const max = Math.max(1, ...days.map((d) => d.count))
  const total = days.reduce((sum, d) => sum + d.count, 0)
  return (
    <figure className="stats-chart">
      <figcaption>
        <strong>{total}</strong> done in the last {DAYS} days
      </figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Tasks done per day, ${total} in ${DAYS} days, at most ${max} a day`}>
        <line className="baseline" x1="0" x2={WIDTH} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} />
        {days.map((d, i) => (
          <g key={d.key}>
            {d.count > 0 && <path className="bar" d={barPath(i * SLOT + GAP / 2, SLOT - GAP, (d.count / max) * (HEIGHT - 4))} />}
            {/* Full-height hit area: the tooltip works on short and empty days too. */}
            <rect className="hit" x={i * SLOT} y="0" width={SLOT} height={HEIGHT}>
              <title>{`${dayName(d.date)}: ${d.count} done`}</title>
            </rect>
          </g>
        ))}
      </svg>
      <div className="stats-axis" aria-hidden="true">
        <span>{dayName(days[0].date)}</span>
        <span>Today</span>
      </div>
    </figure>
  )
}

// Stats pop-up (native <dialog>, same pattern and styles as ShortcutsHelp): done per day, per category, due tasks.
export function StatsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    ref.current?.showModal()
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    let current = true
    taskStorage.getStats(DAYS, tz).then(
      (s) => current && setStats(s),
      () => current && setFailed(true),
    )
    return () => {
      current = false
    }
  }, [])

  const maxCategory = Math.max(1, ...(stats?.doneByCategory.map((c) => c.count) ?? []))

  return (
    <dialog
      ref={ref}
      className="confirm stats"
      aria-labelledby="stats-title"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="confirm-body">
        <h2 id="stats-title">Stats</h2>
        {failed ? (
          <p>The stats couldn’t be loaded. Try again.</p>
        ) : !stats ? (
          <p aria-busy="true">Loading…</p>
        ) : (
          <>
            <div className="stats-tiles">
              <div className={stats.overdue > 0 ? 'tile overdue' : 'tile'}>
                <strong>{stats.overdue}</strong>
                <span>Overdue</span>
              </div>
              <div className={stats.dueSoon > 0 ? 'tile soon' : 'tile'}>
                <strong>{stats.dueSoon}</strong>
                <span>Due within 24 h</span>
              </div>
            </div>
            <DoneChart days={fillDays(stats.donePerDay, DAYS)} />
            {stats.doneByCategory.length > 0 && (
              <ul className="stats-categories" aria-label="Done per category">
                {stats.doneByCategory.map((c) => (
                  <li key={c.category ?? ''}>
                    <span>{c.category ?? 'Deleted category'}</span>
                    <span className="meter" style={{ width: `${(c.count / maxCategory) * 100}%` }} />
                    <span className="count">{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="confirm-actions">
          <button type="button" onClick={onClose} autoFocus>
            OK
          </button>
        </div>
      </div>
    </dialog>
  )
}
