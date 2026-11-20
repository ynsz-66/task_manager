import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Board as BoardState } from '../hooks/useBoard'
import type { Category, Task } from '../types'
import { Board } from './Board'

// Board's keys, end to end: a real keydown on the focused element, through useKeyboardNav, to the board action called.
// `board` is a fake: useBoard's own behavior is covered by useBoard.test.ts.

const categories: Category[] = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
  { id: 'c', name: 'C' },
  { id: 'other', name: 'Other' },
]
const task = (id: string, title: string, category: string, position: number, parent: string | null = null, done = false): Task => ({
  id,
  title,
  category,
  done,
  parent,
  position,
})
// A: one (sub one, sub two), two. B: three. C: empty. Other: misc. Done: finished.
const initialTasks: Task[] = [
  task('t1', 'one', 'a', 0),
  task('s1', 'sub one', 'a', 0, 't1'),
  task('s2', 'sub two', 'a', 1, 't1'),
  task('t2', 'two', 'a', 1),
  task('t3', 'three', 'b', 0),
  task('o1', 'misc', 'other', 0),
  task('d1', 'finished', 'a', 2, null, true),
]

function fakeBoard(tasks: Task[]) {
  return {
    tasks,
    categories,
    freshId: null,
    editingId: null,
    leavingId: null,
    deletedTask: null,
    setEditingId: vi.fn(),
    changeTask: vi.fn(),
    deleteTask: vi.fn(),
    undoDelete: vi.fn(),
    reorderTask: vi.fn(),
    moveTask: vi.fn(),
    nestTask: vi.fn(),
    addTask: vi.fn(),
    renameCategory: vi.fn(),
    moveCategory: vi.fn(),
  }
}

function renderBoard(tasks = initialTasks) {
  const board = fakeBoard(tasks)
  const callbacks = {
    onRequestDeleteCategory: vi.fn(),
    onRequestClearDone: vi.fn(),
    onRequestClearCategory: vi.fn(),
    onRequestHelp: vi.fn(),
    onRequestNewCategory: vi.fn(),
    onToggleTheme: vi.fn(),
  }
  const view = render(<Board board={board as unknown as BoardState} {...callbacks} />)
  const rerender = (next: Task[], leavingId: string | null = null) => {
    view.rerender(<Board board={{ ...board, tasks: next, leavingId } as unknown as BoardState} {...callbacks} />)
  }
  return { board, callbacks, rerender }
}

/** Keys as a user types them: sent to whatever has the focus, bubbling up to window. */
function press(...keys: string[]) {
  for (const key of keys) fireEvent.keyDown(document.activeElement ?? document.body, { key })
}

/** Title of the selected task (its own, not its subtasks'). */
function selectedTitle() {
  const selected = document.querySelectorAll('.task.selected')
  expect(selected.length).toBeLessThanOrEqual(1)
  return selected[0]?.querySelector(':scope > .body > .title')?.textContent ?? null
}

/** Name of the column selected while empty. */
function selectedColumn() {
  return document.querySelector('.col.selected h2')?.textContent ?? null
}

/** The task row whose title is `title`. */
function row(title: string) {
  return screen.getByText(title).closest('.task') as HTMLElement
}

beforeAll(() => {
  // jsdom has neither: Board reads the reduced-motion preference, dialogs open as modals.
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as never
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})
afterEach(cleanup)

describe('Board keyboard: motions', () => {
  it('selects nothing until a key is pressed, then the first task', () => {
    renderBoard()
    expect(selectedTitle()).toBeNull()
    press('j')
    expect(selectedTitle()).toBe('one')
  })

  it('walks through subtasks with j / k, and gives the focus to the selected row', () => {
    renderBoard()
    press('j', 'j')
    expect(selectedTitle()).toBe('sub one')
    expect(document.activeElement).toBe(row('sub one'))
    press('j', 'j')
    expect(selectedTitle()).toBe('two')
    press('j')
    expect(selectedTitle()).toBe('two')
    press('k')
    expect(selectedTitle()).toBe('sub two')
  })

  it('jumps with gg / G', () => {
    renderBoard()
    press('j', 'G')
    expect(selectedTitle()).toBe('two')
    press('g', 'g')
    expect(selectedTitle()).toBe('one')
  })

  it('changes column with h / l, through an empty one, up to Done', () => {
    renderBoard()
    press('j', 'l')
    expect(selectedTitle()).toBe('three')
    press('l')
    expect(selectedTitle()).toBeNull()
    expect(selectedColumn()).toBe('C')
    press('l', 'l')
    expect(selectedTitle()).toBe('finished')
    press('l')
    expect(selectedTitle()).toBe('finished')
    press('h', 'h')
    expect(selectedColumn()).toBe('C')
  })

  it('clears the selection with Escape', () => {
    renderBoard()
    press('j', 'Escape')
    expect(selectedTitle()).toBeNull()
  })

  it('selects a clicked task, a subtask without its parent', () => {
    renderBoard()
    fireEvent.click(screen.getByText('sub two'))
    expect(selectedTitle()).toBe('sub two')
    expect(row('one').classList.contains('selected')).toBe(false)
  })
})

describe('Board keyboard: commands', () => {
  it('x checks the task; the selection moves to the task that takes its row', () => {
    const { board, rerender } = renderBoard()
    press('j', 'x')
    expect(board.changeTask).toHaveBeenCalledWith('t1', { done: true })
    // As useBoard does: the task and its subtasks are checked, so they leave the column for Done.
    rerender(initialTasks.map((t) => (['t1', 's1', 's2'].includes(t.id) ? { ...t, done: true } : t)))
    expect(selectedTitle()).toBe('two')
  })

  it('x on a subtask keeps it selected (it stays under its parent)', () => {
    const { board, rerender } = renderBoard()
    press('j', 'j', 'x')
    expect(board.changeTask).toHaveBeenCalledWith('s1', { done: true })
    rerender(initialTasks.map((t) => (t.id === 's1' ? { ...t, done: true } : t)))
    expect(selectedTitle()).toBe('sub one')
  })

  it('Space checks too, x in Done unchecks', () => {
    const { board } = renderBoard()
    press('j', ' ')
    expect(board.changeTask).toHaveBeenLastCalledWith('t1', { done: true })
    fireEvent.click(screen.getByText('finished'))
    press('x')
    expect(board.changeTask).toHaveBeenLastCalledWith('d1', { done: false })
  })

  it('dd deletes the selected task, a single d does not', () => {
    const { board } = renderBoard()
    press('j', 'j', 'd')
    expect(board.deleteTask).not.toHaveBeenCalled()
    press('d')
    expect(board.deleteTask).toHaveBeenCalledWith('s1')
  })

  it('the selection moves to a neighbor as soon as the deleted task starts leaving, and stays once it is gone', () => {
    const { rerender } = renderBoard()
    press('j', 'G', 'd', 'd')
    // As useBoard does: exit animation first (leavingId), then the task is removed.
    rerender(initialTasks, 't2')
    expect(selectedTitle()).toBe('sub two')
    rerender(initialTasks.filter((t) => t.id !== 't2'))
    expect(selectedTitle()).toBe('sub two')
  })

  it('u undoes the delete, even with nothing selected', () => {
    const { board } = renderBoard()
    press('u')
    expect(board.undoDelete).toHaveBeenCalledTimes(1)
  })

  it('i and Enter edit the selected task', () => {
    const { board } = renderBoard()
    press('j', 'i')
    expect(board.setEditingId).toHaveBeenLastCalledWith('t1')
    press('j', 'Enter')
    expect(board.setEditingId).toHaveBeenLastCalledWith('s1')
    expect(board.setEditingId).toHaveBeenCalledTimes(2)
  })

  it('o opens the add field of the column; keys typed in it are text', () => {
    const { board } = renderBoard()
    press('j', 'j', 'o')
    const field = screen.getByLabelText('New task in A')
    expect(document.activeElement).toBe(field)
    press('x', 'd', 'd', 'j')
    expect(board.changeTask).not.toHaveBeenCalled()
    expect(board.deleteTask).not.toHaveBeenCalled()
    expect(selectedTitle()).toBe('sub one')
  })

  it('o works in an empty column, not in Done', () => {
    renderBoard()
    press('j', 'l', 'l', 'o')
    expect(screen.getByLabelText('New task in C')).toBeTruthy()
    fireEvent.keyDown(screen.getByLabelText('New task in C'), { key: 'Escape' })
    press('l', 'l', 'o')
    expect(screen.queryByLabelText(/^New task in/)).toBeNull()
  })

  it('a opens the add-subtask field under the task, not under a done task', () => {
    renderBoard()
    press('j', 'a')
    const field = screen.getByLabelText('New task in one')
    expect(row('one').contains(field)).toBe(true)
    fireEvent.keyDown(field, { key: 'Escape' })
    fireEvent.click(screen.getByText('finished'))
    press('a')
    expect(screen.queryByLabelText('New task in finished')).toBeNull()
  })

  it('r renames a category, not Other', () => {
    renderBoard()
    press('j', 'r')
    expect(screen.getByLabelText('Rename the A category')).toBeTruthy()
    fireEvent.keyDown(screen.getByLabelText('Rename the A category'), { key: 'Escape' })
    fireEvent.click(screen.getByText('misc'))
    press('r')
    expect(screen.queryByLabelText('Rename the Other category')).toBeNull()
  })

  it('c and ? ask App for the category field and the help', () => {
    const { callbacks } = renderBoard()
    press('c', '?')
    expect(callbacks.onRequestNewCategory).toHaveBeenCalledTimes(1)
    expect(callbacks.onRequestHelp).toHaveBeenCalledTimes(1)
  })
})

describe('Board keyboard: moves', () => {
  it('J / K move a task among its siblings, nothing at an edge', () => {
    const { board } = renderBoard()
    press('j', 'K')
    expect(board.reorderTask).not.toHaveBeenCalled()
    press('J')
    // Root list of A: one, two (the done task is in Done): one goes to the end.
    expect(board.reorderTask).toHaveBeenLastCalledWith('t1', { parent: null, category: 'a', before: null })
    fireEvent.click(screen.getByText('sub two'))
    press('K')
    expect(board.reorderTask).toHaveBeenLastCalledWith('s2', { parent: 't1', category: 'a', before: 's1' })
    press('J')
    expect(board.reorderTask).toHaveBeenCalledTimes(2)
  })

  it('H / L move a task to the next category column, never into Done', () => {
    const { board } = renderBoard()
    press('j', 'H')
    expect(board.moveTask).not.toHaveBeenCalled()
    press('L')
    expect(board.moveTask).toHaveBeenLastCalledWith('t1', 'b')
    fireEvent.click(screen.getByText('misc'))
    press('L')
    expect(board.moveTask).toHaveBeenCalledTimes(1)
    press('H')
    expect(board.moveTask).toHaveBeenLastCalledWith('o1', 'c')
  })

  it('> nests under the task above, < takes out one level', () => {
    const { board } = renderBoard()
    press('j', '>')
    expect(board.nestTask).not.toHaveBeenCalled()
    press('G', '>')
    expect(board.nestTask).toHaveBeenCalledWith('t2', 't1')
    press('<')
    expect(board.reorderTask).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('sub one'))
    press('<')
    expect(board.reorderTask).toHaveBeenCalledWith('s1', { parent: null, category: 'a', before: 't2' })
  })

  it('nothing moves in the Done column', () => {
    const { board } = renderBoard()
    fireEvent.click(screen.getByText('finished'))
    press('J', 'K', 'H', 'L', '>', '<')
    expect(board.reorderTask).not.toHaveBeenCalled()
    expect(board.moveTask).not.toHaveBeenCalled()
    expect(board.nestTask).not.toHaveBeenCalled()
  })
})

describe('Board keyboard: palette', () => {
  it('Cmd+K opens it; its commands act on the selected task', () => {
    const { board } = renderBoard()
    press('j', 'j')
    fireEvent.keyDown(document.activeElement!, { key: 'k', metaKey: true })
    // Not checked here: the focus on the field. showModal gives it in a browser, jsdom has no showModal (stubbed).
    const input = screen.getByRole('combobox', { hidden: true })
    fireEvent.change(input, { target: { value: 'delete' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(board.deleteTask).toHaveBeenCalledWith('s1')
    expect(screen.queryByRole('combobox', { hidden: true })).toBeNull()
  })

  it('Ctrl+K opens it too, and the board keys wait while it is open', () => {
    renderBoard()
    press('j')
    fireEvent.keyDown(document.activeElement!, { key: 'k', ctrlKey: true })
    fireEvent.keyDown(document.body, { key: 'j' })
    expect(selectedTitle()).toBe('one')
  })

  it('"Go to task" selects a task by its title', () => {
    renderBoard()
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true })
    const input = screen.getByRole('combobox', { hidden: true })
    fireEvent.change(input, { target: { value: 'go to task three' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(selectedTitle()).toBe('three')
  })
})
