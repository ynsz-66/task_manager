import { describe, expect, it } from 'vitest'
import { dueLabel, dueStatus, fillDays, fromLocalInput, localDay, toLocalInput } from './dueDate'

// Local times (no offset), so the tests pass in any timezone.
const now = new Date(2026, 10, 20, 12, 0)
const at = (month: number, day: number, hours: number, minutes = 0, year = 2026) => new Date(year, month, day, hours, minutes).toISOString()

describe('dueStatus', () => {
  it('is overdue once passed, soon within 24 h, later after', () => {
    expect(dueStatus(at(10, 20, 11, 59), now)).toBe('overdue')
    expect(dueStatus(at(10, 21, 11, 59), now)).toBe('soon')
    expect(dueStatus(at(10, 21, 12, 0), now)).toBe('later')
  })
})

describe('dueLabel', () => {
  it('names today, tomorrow and yesterday with the time', () => {
    expect(dueLabel(at(10, 20, 14), now)).toBe('Today 14:00')
    expect(dueLabel(at(10, 21, 9), now)).toBe('Tomorrow 09:00')
    expect(dueLabel(at(10, 19, 8, 5), now)).toBe('Yesterday 08:05')
  })

  it('gives the weekday and time ahead, the date only in the past, the year if not this one', () => {
    expect(dueLabel(at(10, 24, 18, 30), now)).toBe('Tue 24 Nov 18:30')
    expect(dueLabel(at(10, 10, 9), now)).toBe('10 Nov')
    expect(dueLabel(at(0, 5, 9, 0, 2027), now)).toBe('Tue 5 Jan 2027 09:00')
  })
})

describe('datetime-local conversion', () => {
  it('round-trips through the input value in local time', () => {
    const iso = at(10, 21, 9, 30)
    expect(toLocalInput(iso)).toBe('2026-11-21T09:30')
    expect(fromLocalInput('2026-11-21T09:30')).toBe(iso)
    expect(localDay(now)).toBe('2026-11-20')
  })
})

describe('fillDays', () => {
  it('gives the last 30 local days, oldest first, 0 when missing', () => {
    const days = fillDays([{ date: '2026-11-20', count: 3 }, { date: '2026-10-01', count: 9 }], 30, new Date(2026, 10, 20, 8))
    expect(days).toHaveLength(30)
    expect(days[0].key).toBe('2026-10-22')
    expect(days[29]).toMatchObject({ key: '2026-11-20', count: 3 })
    expect(days.reduce((sum, d) => sum + d.count, 0)).toBe(3)
  })
})
