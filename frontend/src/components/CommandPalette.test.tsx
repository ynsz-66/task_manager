import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { filterItems, type PaletteItem } from '../keyboardNav'
import { CommandPalette } from './CommandPalette'

const item = (id: string, label: string, detail?: string): PaletteItem => ({ id, label, detail, run: vi.fn() })

describe('filterItems', () => {
  const items = [item('1', 'Check', 'Été'), item('2', 'Go to task', 'Buy milk'), item('3', 'New category')]

  it('matches every word, ignoring case and accents', () => {
    expect(filterItems(items, 'ete').map((i) => i.id)).toEqual(['1'])
    expect(filterItems(items, 'go MILK').map((i) => i.id)).toEqual(['2'])
    expect(filterItems(items, '')).toHaveLength(3)
  })
})

describe('CommandPalette', () => {
  // jsdom has no showModal / close.
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open')
    }
  })
  afterEach(cleanup)

  it('runs the picked item with the arrows and Enter, then closes', () => {
    const items = [item('a', 'Check'), item('b', 'Delete')]
    const onClose = vi.fn()
    render(<CommandPalette items={items} onClose={onClose} />)
    const input = screen.getByRole('combobox', { hidden: true })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(items[1].run).toHaveBeenCalled()
    expect(items[0].run).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('filters as you type, runs a clicked item, and says when nothing matches', () => {
    const items = [item('a', 'Check'), item('b', 'Delete')]
    render(<CommandPalette items={items} onClose={vi.fn()} />)
    const input = screen.getByRole('combobox', { hidden: true })
    fireEvent.change(input, { target: { value: 'del' } })
    expect(screen.queryByText('Check')).toBeNull()
    fireEvent.click(screen.getByText('Delete'))
    expect(items[1].run).toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText('No match')).toBeTruthy()
  })
})
