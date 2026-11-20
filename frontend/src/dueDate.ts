const DAY_MS = 24 * 60 * 60 * 1000
// Fixed locale: the UI is in English, and tests stay deterministic.
const LOCALE = 'en-GB'

export type DueStatus = 'overdue' | 'soon' | 'later'

/** Overdue once passed, soon within 24 h. */
export function dueStatus(iso: string, now = new Date()): DueStatus {
  const left = new Date(iso).getTime() - now.getTime()
  return left < 0 ? 'overdue' : left < DAY_MS ? 'soon' : 'later'
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** "Today 14:00", "Tomorrow 09:00", "Mon 24 Nov 18:30"; older than yesterday: "21 Nov" (local time). */
export function dueLabel(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false })
  // Rounded: a DST change makes a day 23 or 25 h long.
  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS)
  if (days === 0) return `Today ${time}`
  if (days === 1) return `Tomorrow ${time}`
  if (days === -1) return `Yesterday ${time}`
  const year = date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
  if (days < 0) return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year })
  const day = date.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year })
  return `${day.replace(',', '')} ${time}`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Local `YYYY-MM-DD` (the stats' day keys, in the browser timezone). */
export function localDay(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The last `days` local days, oldest first, with 0 for the days missing from `perDay` (`date` = YYYY-MM-DD). */
export function fillDays(perDay: { date: string; count: number }[], days: number, now = new Date()) {
  const counts = new Map(perDay.map((d) => [d.date, d.count]))
  return Array.from({ length: days }, (_, i) => {
    // Noon: one day back is never the same day across a DST change.
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
    date.setTime(date.getTime() - (days - 1 - i) * DAY_MS)
    const key = localDay(date)
    return { key, date, count: counts.get(key) ?? 0 }
  })
}

/** ISO date → `<input type="datetime-local">` value, in local time. */
export function toLocalInput(iso: string) {
  const date = new Date(iso)
  return `${localDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `datetime-local` value (local time, no offset) → ISO 8601 in UTC, which the API accepts. */
export function fromLocalInput(value: string) {
  return new Date(value).toISOString()
}
