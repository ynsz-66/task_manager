import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
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

  it('loads the stats in the browser timezone and shows them', async () => {
    storage.getStats.mockResolvedValue({
      donePerDay: [],
      doneByCategory: [{ category: 'dev', count: 4 }, { category: null, count: 1 }],
      overdue: 2,
      dueSoon: 0,
    })
    const onClose = vi.fn()
    render(<StatsDialog onClose={onClose} />)
    expect(await screen.findByText('dev')).toBeTruthy()
    expect(screen.getByText('Deleted category')).toBeTruthy()
    expect(screen.getByText('Overdue').previousSibling?.textContent).toBe('2')
    expect(storage.getStats).toHaveBeenCalledWith(30, Intl.DateTimeFormat().resolvedOptions().timeZone)
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('says so when loading fails', async () => {
    storage.getStats.mockRejectedValue(new Error('down'))
    render(<StatsDialog onClose={vi.fn()} />)
    expect(await screen.findByText(/couldn’t be loaded/)).toBeTruthy()
  })
})
