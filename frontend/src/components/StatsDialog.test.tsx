import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types'
import { localDay, weekSpan } from '../dueDate'
import { StatsDialog } from './StatsDialog'

const storage = vi.hoisted(() => ({ getStats: vi.fn() }))
vi.mock('../services/taskStorage', () => ({ taskStorage: storage }))

describe('StatsDialog', () => {
  // jsdom has no showModal.
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
  })
  afterEach(cleanup)

  const categories = [
    { id: 'c1', name: 'dev' },
    { id: 'c2', name: 'Empty' },
  ]
  const hour = 60 * 60 * 1000
  const inHours = (h: number) => new Date(Date.now() + h * hour).toISOString()
  const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, category: 'c1', done: false, parent: null, position: 0, ...extra })
  const tasks = [
    task('later', { dueDate: inHours(48) }),
    task('late', { dueDate: inHours(-2) }),
    task('next month', { dueDate: inHours(24 * 30) }),
    task('finished', { done: true, dueDate: inHours(-5) }),
    task('sub', { parent: 'later', done: true }),
  ]

  it('loads the weeks in the browser timezone, shows progress and the tasks due this week', async () => {
    storage.getStats.mockResolvedValue({ donePerDay: [], doneByCategory: [], overdue: 2, dueSoon: 0 })
    const onClose = vi.fn()
    const onSelectTask = vi.fn()
    render(<StatsDialog tasks={tasks} categories={categories} onClose={onClose} onSelectTask={onSelectTask} />)
    expect(await screen.findByText('2/5')).toBeTruthy()
    expect(screen.queryByText('Empty')).toBeNull()
    expect(screen.getByText('Overdue').previousSibling?.textContent).toBe('2')
    expect(screen.getByRole('img', { name: 'No task done in the last year' })).toBeTruthy()
    expect(storage.getStats).toHaveBeenCalledWith(weekSpan(52) + 1, Intl.DateTimeFormat().resolvedOptions().timeZone)
    const due = within(screen.getByRole('list', { name: 'Overdue or due this week' })).getAllByRole('button')
    expect(due.map((b) => b.querySelector('span')?.textContent)).toEqual(['late', 'later'])
    fireEvent.click(due[0])
    expect(onSelectTask).toHaveBeenCalledWith('late')
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('draws the heatmap from a Monday, the busiest day at the top level', async () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    storage.getStats.mockResolvedValue({
      donePerDay: [{ date: localDay(new Date()), count: 4 }, { date: localDay(yesterday), count: 1 }],
      doneByCategory: [],
      overdue: 0,
      dueSoon: 0,
    })
    render(<StatsDialog tasks={[]} categories={[]} onClose={vi.fn()} onSelectTask={vi.fn()} />)
    expect(await screen.findByText('done in the last year', { exact: false })).toBeTruthy()
    const cells = [...document.querySelectorAll('.heatmap-scroll rect')]
    expect(cells).toHaveLength(weekSpan(52))
    expect(cells[0].textContent).toMatch(/^Mon /)
    expect(cells.at(-1)?.getAttribute('class')).toBe('cell lvl-4')
    expect(cells.at(-2)?.getAttribute('class')).toBe('cell lvl-1')
    expect(cells.filter((c) => c.getAttribute('class') !== 'cell lvl-0')).toHaveLength(2)
  })

  it('says so when loading fails', async () => {
    storage.getStats.mockRejectedValue(new Error('down'))
    render(<StatsDialog tasks={[]} categories={[]} onClose={vi.fn()} onSelectTask={vi.fn()} />)
    expect(await screen.findByText(/couldn’t be loaded/)).toBeTruthy()
  })
})
