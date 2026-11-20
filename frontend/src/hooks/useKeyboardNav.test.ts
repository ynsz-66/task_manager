import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NavColumn } from '../keyboardNav'
import { PREFIX_TIMEOUT_MS, useKeyboardNav } from './useKeyboardNav'

const columns: NavColumn[] = [
  { id: 'a', tasks: ['t1', 't2', 't3'] },
  { id: 'b', tasks: [] },
]

function press(key: string, target: EventTarget = document.body, init: KeyboardEventInit = {}) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  })
}

function renderNav() {
  const onCommand = vi.fn()
  const view = renderHook(() => useKeyboardNav(columns, onCommand))
  return { result: view.result, onCommand }
}

describe('useKeyboardNav', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('moves the selection with the motion keys and clears it with Escape', () => {
    const { result } = renderNav()
    press('j')
    expect(result.current.selection).toEqual({ column: 'a', task: 't1', index: 0 })
    press('j')
    press('l')
    expect(result.current.selection).toEqual({ column: 'b', task: null, index: 0 })
    press('Escape')
    expect(result.current.selection).toBeNull()
  })

  it('sends commands with the selection', () => {
    const { onCommand } = renderNav()
    press('j')
    press('x')
    expect(onCommand).toHaveBeenLastCalledWith('toggle', { column: 'a', task: 't1', index: 0 })
    press('J')
    expect(onCommand).toHaveBeenLastCalledWith('moveDown', expect.anything())
  })

  it('reads dd and gg only when the second key comes in time', () => {
    const { result, onCommand } = renderNav()
    press('G')
    press('g')
    press('g')
    expect(result.current.selection?.task).toBe('t1')
    press('d')
    vi.advanceTimersByTime(PREFIX_TIMEOUT_MS + 1)
    press('d')
    expect(onCommand).not.toHaveBeenCalled()
    press('d')
    expect(onCommand).toHaveBeenCalledWith('delete', expect.objectContaining({ task: 't1' }))
  })

  it('ignores keys typed in a field, with a modifier, or while a dialog is open', () => {
    const { result, onCommand } = renderNav()
    const input = document.body.appendChild(document.createElement('input'))
    press('j', input)
    press('j', document.body, { ctrlKey: true })
    const dialog = document.body.appendChild(document.createElement('dialog'))
    dialog.setAttribute('open', '')
    press('j')
    press('x')
    expect(result.current.selection).toBeNull()
    expect(onCommand).not.toHaveBeenCalled()
  })

  it('opens the palette with Cmd+K or Ctrl+K, even from a field', () => {
    const { onCommand } = renderNav()
    press('k', document.body, { metaKey: true })
    const input = document.body.appendChild(document.createElement('input'))
    press('K', input, { ctrlKey: true })
    expect(onCommand.mock.calls.map(([command]) => command)).toEqual(['palette', 'palette'])
  })

  it('ignores Alt combos and keys typed in a textarea', () => {
    const { result, onCommand } = renderNav()
    press('j', document.body, { altKey: true })
    const textarea = document.body.appendChild(document.createElement('textarea'))
    press('j', textarea)
    press('x', textarea)
    expect(result.current.selection).toBeNull()
    expect(onCommand).not.toHaveBeenCalled()
  })

  it('does not read g j g as gg', () => {
    const { result } = renderNav()
    press('j')
    press('G')
    press('g')
    press('k')
    press('g')
    expect(result.current.selection?.task).toBe('t2')
  })

  it('lets Enter activate a focused button', () => {
    const { onCommand } = renderNav()
    const button = document.body.appendChild(document.createElement('button'))
    press('Enter', button)
    expect(onCommand).not.toHaveBeenCalled()
  })

  it('selects a clicked task, and releases it to its neighbor', () => {
    const { result } = renderNav()
    act(() => result.current.selectTask('t2'))
    expect(result.current.selection).toEqual({ column: 'a', task: 't2', index: 1 })
    act(() => result.current.releaseTask())
    expect(result.current.selection).toEqual({ column: 'a', task: 't2', index: 1 })
  })
})
