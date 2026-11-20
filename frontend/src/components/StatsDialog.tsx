import { useEffect, useRef, useState } from 'react'
import type { Category, Stats, Task } from '../types'
import { taskStorage } from '../services/taskStorage'
import { fillDays, fillWeeks, weekSpan } from '../dueDate'
import { DueBadge } from './TaskItem'

const WEEKS = 12
/** Heatmap length: 52 weeks + this one stay within the API's 366 days. */
const HEAT_WEEKS = 52
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
// Chart geometry (SVG units, scaled to the dialog width).
const WIDTH = 360
const HEIGHT = 96
const SLOT = WIDTH / WEEKS
const GAP = 2
const RADIUS = 2

/** A bar rounded on its top end only, standing on the baseline. */
function barPath(x: number, width: number, height: number) {
  const r = Math.min(RADIUS, height, width / 2)
  const top = HEIGHT - height
  return `M${x},${HEIGHT}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${HEIGHT}Z`
}

const weekName = (date: Date) => `Week of ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`

function DoneChart({ weeks }: { weeks: ReturnType<typeof fillWeeks> }) {
  const max = Math.max(1, ...weeks.map((w) => w.count))
  const total = weeks.reduce((sum, w) => sum + w.count, 0)
  return (
    <figure className="stats-chart">
      <figcaption>
        <strong>{total}</strong> done in the last {WEEKS} weeks
      </figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={total ? `Tasks done per week, ${total} in ${WEEKS} weeks, at most ${max} a week` : `No task done in the last ${WEEKS} weeks`}>
        <line className="baseline" x1="0" x2={WIDTH} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} />
        {weeks.map((w, i) => (
          <g key={w.key}>
            {w.count > 0 && <path className="bar" d={barPath(i * SLOT + GAP / 2, SLOT - GAP, (w.count / max) * (HEIGHT - 4))} />}
            {/* Full-height hit area: the tooltip works on short and empty weeks too. */}
            <rect className="hit" x={i * SLOT} y="0" width={SLOT} height={HEIGHT}>
              <title>{`${weekName(w.date)}: ${w.count} done`}</title>
            </rect>
          </g>
        ))}
      </svg>
      <div className="stats-axis" aria-hidden="true">
        <span>{weekName(weeks[0].date)}</span>
        <span>This week</span>
      </div>
    </figure>
  )
}

// Heatmap geometry (px, not scaled: it scrolls sideways on narrow screens).
const CELL = 10
const STEP = CELL + 2
const LEFT = 26
const TOP = 16
const ROW_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', '']
const shortDay = (date: Date) => date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

/** GitHub-style calendar: one column per week (Monday on top), color level relative to the busiest day. */
function Heatmap({ days }: { days: ReturnType<typeof fillDays> }) {
  const scroller = useRef<HTMLDivElement>(null)
  // Most recent weeks first in view.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth
  }, [])
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, i) => days.slice(i * 7, i * 7 + 7))
  const max = Math.max(1, ...days.map((d) => d.count))
  const total = days.reduce((sum, d) => sum + d.count, 0)
  const level = (count: number) => (count === 0 ? 0 : Math.ceil((count / max) * 4))
  return (
    <figure className="stats-chart heatmap">
      <figcaption>
        <strong>{total}</strong> done in the last year
      </figcaption>
      <div className="heatmap-scroll" ref={scroller}>
        <svg
          width={LEFT + weeks.length * STEP}
          height={TOP + 7 * STEP}
          role="img"
          aria-label={total ? `Tasks done per day over the last year: ${total}, at most ${max} a day` : 'No task done in the last year'}
        >
          {ROW_LABELS.map((label, row) => label && (
            <text key={label} className="label" x="0" y={TOP + row * STEP + CELL - 1}>
              {label}
            </text>
          ))}
          {weeks.map((week, col) => (
            <g key={week[0].key} transform={`translate(${LEFT + col * STEP} 0)`}>
              {/* Month name over the first week that starts in it (none on the first, partial column). */}
              {col > 0 && week[0].date.getMonth() !== weeks[col - 1][0].date.getMonth() && (
                <text className="label" x="0" y={TOP - 5}>
                  {week[0].date.toLocaleDateString('en-GB', { month: 'short' })}
                </text>
              )}
              {week.map((d, row) => (
                <rect key={d.key} className={`cell lvl-${level(d.count)}`} y={TOP + row * STEP} width={CELL} height={CELL} rx="2">
                  <title>{`${shortDay(d.date)}: ${d.count} done`}</title>
                </rect>
              ))}
            </g>
          ))}
        </svg>
      </div>
      <div className="heatmap-legend" aria-hidden="true">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <svg key={l} width={CELL} height={CELL}>
            <rect className={`cell lvl-${l}`} width={CELL} height={CELL} rx="2" />
          </svg>
        ))}
        More
      </div>
    </figure>
  )
}

const RING_R = 22
const RING_C = 2 * Math.PI * RING_R

/** Donut: the done share of a category, percent in the middle. */
function ProgressRing({ name, done, total }: { name: string; done: number; total: number }) {
  const share = done / total
  return (
    <li>
      <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
        <circle className="ring-track" cx="28" cy="28" r={RING_R} />
        {done > 0 && (
          <circle
            className="ring-value"
            cx="28"
            cy="28"
            r={RING_R}
            strokeDasharray={`${share * RING_C} ${RING_C}`}
            transform="rotate(-90 28 28)"
          />
        )}
        <text x="28" y="28" dominantBaseline="central" textAnchor="middle">
          {Math.floor(share * 100)}%
        </text>
      </svg>
      <span className="name">{name}</span>
      <span className="count">
        {done}/{total}
      </span>
    </li>
  )
}

interface StatsDialogProps {
  /** The board's tasks and categories: progress and the due list come from them, not from the API. */
  tasks: Task[]
  categories: Category[]
  onClose: () => void
  /** Clicking a task in the due list. */
  onSelectTask: (id: string) => void
}

// Dashboard pop-up (native <dialog>, same pattern and styles as ShortcutsHelp): due tiles and list, done per week, progress.
export function StatsDialog({ tasks, categories, onClose, onSelectTask }: StatsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    ref.current?.showModal()
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    let current = true
    // +1 day: the API counts back from now, so the oldest Monday would miss its hours before the current time.
    taskStorage.getStats(weekSpan(HEAT_WEEKS) + 1, tz).then(
      (s) => current && setStats(s),
      () => current && setFailed(true),
    )
    return () => {
      current = false
    }
  }, [])

  // Every task counts, subtasks included; categories without tasks are left out.
  const progress = categories
    .map((c) => {
      const own = tasks.filter((t) => t.category === c.id)
      return { id: c.id, name: c.name, done: own.filter((t) => t.done).length, total: own.length }
    })
    .filter((p) => p.total > 0)
  // Overdue, or due within the next 7 days; soonest first.
  // Taken when the dashboard opens: the list doesn't shift while it stays open.
  const [weekEnd] = useState(() => Date.now() + WEEK_MS)
  const due = tasks
    .filter((t): t is Task & { dueDate: string } => !t.done && !!t.dueDate && new Date(t.dueDate).getTime() <= weekEnd)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())

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
        <h2 id="stats-title">Dashboard</h2>
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
            {due.length > 0 && (
              <ul className="stats-due" aria-label="Overdue or due this week">
                {due.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="ghost" onClick={() => onSelectTask(t.id)}>
                      <span>{t.title}</span>
                      <DueBadge iso={t.dueDate} done={false} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Heatmap days={fillDays(stats.donePerDay, weekSpan(HEAT_WEEKS))} />
            <DoneChart weeks={fillWeeks(stats.donePerDay, WEEKS)} />
            {progress.length > 0 && (
              <ul className="stats-rings" aria-label="Progress per category">
                {progress.map((p) => (
                  <ProgressRing key={p.id} name={p.name} done={p.done} total={p.total} />
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
