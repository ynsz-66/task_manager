import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category, Task } from '../types'
import { DONE_COLUMN_ID, LEAVE_DURATION_MS, UNDO_DELAY_MS } from '../constants'
import { useBoard } from './useBoard'

const storage = vi.hoisted(() => ({
  getAll: vi.fn(),
  getCategories: vi.fn(),
  createCategory: vi.fn(),
  removeCategory: vi.fn(),
  updateCategory: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  clearDone: vi.fn(),
  clearCategory: vi.fn(),
}))
vi.mock('../services/taskStorage', () => ({ taskStorage: storage }))

const categories: Category[] = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
  { id: 'c', name: 'C' },
  { id: 'other', name: 'Other' },
]
const tasks: Task[] = [
  { id: 't1', title: 'one', category: 'a', done: false, parent: null, position: 0 },
  { id: 't2', title: 'two', category: 'b', done: true, parent: null, position: 0 },
]

async function renderBoard() {
  const view = renderHook(() => useBoard())
  await waitFor(() => expect(view.result.current.categories).toHaveLength(categories.length))
  await waitFor(() => expect(view.result.current.tasks).toHaveLength(tasks.length))
  return view.result
}

const ids = (list: { id: string }[]) => list.map((x) => x.id)

beforeEach(() => {
  vi.resetAllMocks()
  storage.getCategories.mockResolvedValue(categories)
  storage.getAll.mockResolvedValue(tasks)
})

describe('loading', () => {
  it('sets an error when loading fails', async () => {
    storage.getAll.mockRejectedValue(new Error('down'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.error).toMatch(/tasks/))
  })
})

describe('renameCategory', () => {
  it('renames optimistically and sends PATCH { name }', async () => {
    const result = await renderBoard()
    storage.updateCategory.mockResolvedValue({ id: 'a', name: 'Work' })
    await act(() => result.current.renameCategory('a', 'Work'))
    expect(result.current.categories[0].name).toBe('Work')
    expect(storage.updateCategory).toHaveBeenCalledWith('a', { name: 'Work' })
  })

  it('rolls back the name when the storage call fails', async () => {
    const result = await renderBoard()
    storage.updateCategory.mockRejectedValue(new Error('nope'))
    await act(() => result.current.renameCategory('a', 'Work'))
    expect(result.current.categories[0].name).toBe('A')
    expect(result.current.error).toMatch(/renamed/)
  })

  it('does nothing for an empty or unchanged name', async () => {
    const result = await renderBoard()
    await act(() => result.current.renameCategory('a', ''))
    await act(() => result.current.renameCategory('a', 'A'))
    expect(storage.updateCategory).not.toHaveBeenCalled()
  })
})

describe('moveCategory', () => {
  it('moves forward optimistically and sends PATCH { order }', async () => {
    const result = await renderBoard()
    let resolve!: (c: Category) => void
    storage.updateCategory.mockReturnValue(new Promise((r) => (resolve = r)))

    let done!: Promise<void>
    act(() => {
      done = result.current.moveCategory('a', 2) // slot before C -> index 1
    })
    expect(ids(result.current.categories)).toEqual(['b', 'a', 'c', 'other'])
    expect(storage.updateCategory).toHaveBeenCalledWith('a', { order: 1 })

    await act(async () => {
      resolve(categories[0])
      await done
    })
    expect(ids(result.current.categories)).toEqual(['b', 'a', 'c', 'other'])
    expect(result.current.error).toBeNull()
  })

  it('moves backward to the slot index', async () => {
    const result = await renderBoard()
    storage.updateCategory.mockResolvedValue(categories[2])
    await act(() => result.current.moveCategory('c', 0))
    expect(ids(result.current.categories)).toEqual(['c', 'a', 'b', 'other'])
    expect(storage.updateCategory).toHaveBeenCalledWith('c', { order: 0 })
  })

  it('rolls back the state when the storage call fails', async () => {
    const result = await renderBoard()
    storage.updateCategory.mockRejectedValue(new Error('nope'))
    await act(() => result.current.moveCategory('a', 3))
    expect(ids(result.current.categories)).toEqual(ids(categories))
    expect(result.current.error).toMatch(/moved/)
  })

  it('does nothing for a no-op slot or an unknown id', async () => {
    const result = await renderBoard()
    await act(() => result.current.moveCategory('b', 1)) // slot before itself
    await act(() => result.current.moveCategory('b', 2)) // slot right after itself
    await act(() => result.current.moveCategory('zzz', 0))
    expect(storage.updateCategory).not.toHaveBeenCalled()
    expect(ids(result.current.categories)).toEqual(ids(categories))
  })
})

describe('tasks', () => {
  it('addTask appends the task', async () => {
    const created = { id: 't3', title: 'new', category: 'a', done: false }
    storage.create.mockResolvedValue(created)

    const asc = await renderBoard()
    let ok = false
    await act(async () => {
      ok = await asc.current.addTask('new', 'a')
    })
    expect(ok).toBe(true)
    expect(storage.create).toHaveBeenCalledWith('new', 'a', undefined)
    expect(ids(asc.current.tasks)).toEqual(['t1', 't2', 't3'])
    expect(asc.current.freshId).toBe('t3')
  })

  it('addTask ignores an empty title and reports failures', async () => {
    const result = await renderBoard()
    let ok = true
    await act(async () => {
      ok = await result.current.addTask('', 'a')
    })
    expect(ok).toBe(false)
    expect(storage.create).not.toHaveBeenCalled()

    storage.create.mockRejectedValue(new Error('nope'))
    await act(async () => {
      ok = await result.current.addTask('x', 'a')
    })
    expect(ok).toBe(false)
    expect(result.current.tasks).toHaveLength(2)
    expect(result.current.error).toMatch(/added/)
  })

  it('changeTask replaces the task and closes the editor; keeps it on failure', async () => {
    const result = await renderBoard()
    act(() => result.current.setEditingId('t1'))
    storage.update.mockResolvedValue({ ...tasks[0], title: 'renamed' })
    await act(() => result.current.changeTask('t1', { title: 'renamed' }))
    expect(storage.update).toHaveBeenCalledWith('t1', { title: 'renamed' })
    expect(result.current.tasks[0].title).toBe('renamed')
    expect(result.current.editingId).toBeNull()

    act(() => result.current.setEditingId('t1'))
    storage.update.mockRejectedValue(new Error('nope'))
    await act(() => result.current.changeTask('t1', { title: 'again' }))
    expect(result.current.tasks[0].title).toBe('renamed')
    expect(result.current.editingId).toBe('t1')
    expect(result.current.error).toMatch(/updated/)
  })

  it('deleteTask hides the task, then deletes it after the undo delay', async () => {
    const result = await renderBoard()
    vi.useFakeTimers()
    try {
      storage.remove.mockResolvedValue(undefined)
      act(() => result.current.deleteTask('t1'))
      expect(result.current.leavingId).toBe('t1')
      expect(result.current.deletedTask?.id).toBe('t1')

      act(() => vi.advanceTimersByTime(LEAVE_DURATION_MS))
      expect(ids(result.current.tasks)).toEqual(['t2'])
      expect(result.current.leavingId).toBeNull()
      expect(storage.remove).not.toHaveBeenCalled()

      await act(() => vi.advanceTimersByTimeAsync(UNDO_DELAY_MS))
      expect(storage.remove).toHaveBeenCalledWith('t1')
      expect(result.current.deletedTask).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('undoDelete puts the task back at its place and never calls the API', async () => {
    const result = await renderBoard()
    vi.useFakeTimers()
    try {
      act(() => result.current.deleteTask('t1'))
      act(() => vi.advanceTimersByTime(LEAVE_DURATION_MS))
      act(() => result.current.undoDelete())
      expect(ids(result.current.tasks)).toEqual(['t1', 't2'])
      expect(result.current.deletedTask).toBeNull()

      await act(() => vi.advanceTimersByTimeAsync(UNDO_DELAY_MS))
      expect(storage.remove).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('undoDelete during the exit animation keeps a single copy', async () => {
    const result = await renderBoard()
    vi.useFakeTimers()
    try {
      act(() => result.current.deleteTask('t1'))
      act(() => result.current.undoDelete())
      act(() => vi.advanceTimersByTime(LEAVE_DURATION_MS))
      expect(ids(result.current.tasks)).toEqual(['t1', 't2'])
      expect(result.current.leavingId).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a second deleteTask makes the first deletion final', async () => {
    const result = await renderBoard()
    storage.remove.mockResolvedValue(undefined)
    await act(async () => result.current.deleteTask('t1'))
    await act(async () => result.current.deleteTask('t2'))
    expect(storage.remove).toHaveBeenCalledWith('t1')
    expect(storage.remove).not.toHaveBeenCalledWith('t2')
    expect(result.current.deletedTask?.id).toBe('t2')
  })

  it('deleteTask restores the task when the API fails', async () => {
    const result = await renderBoard()
    vi.useFakeTimers()
    try {
      storage.remove.mockRejectedValue(new Error('nope'))
      act(() => result.current.deleteTask('t1'))
      await act(() => vi.advanceTimersByTimeAsync(UNDO_DELAY_MS))
      expect(ids(result.current.tasks)).toEqual(['t1', 't2'])
      expect(result.current.error).toMatch(/deleted/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clearDone removes done tasks only on success', async () => {
    const result = await renderBoard()
    storage.clearDone.mockRejectedValueOnce(new Error('nope'))
    await act(() => result.current.clearDone())
    expect(result.current.tasks).toHaveLength(2)

    storage.clearDone.mockResolvedValue(1)
    await act(() => result.current.clearDone())
    expect(ids(result.current.tasks)).toEqual(['t1'])
  })

  it('clearCategory removes the category\'s not-done tasks only on success', async () => {
    const result = await renderBoard()
    storage.clearCategory.mockRejectedValueOnce(new Error('nope'))
    await act(() => result.current.clearCategory('a'))
    expect(result.current.tasks).toHaveLength(2)

    storage.clearCategory.mockResolvedValue(1)
    await act(() => result.current.clearCategory('a'))
    expect(storage.clearCategory).toHaveBeenCalledWith('a')
    expect(ids(result.current.tasks)).toEqual(['t2'])
  })
})

describe('moveTask', () => {
  it('moves to Done optimistically with { done: true }', async () => {
    const result = await renderBoard()
    let resolve!: (t: Task) => void
    storage.update.mockReturnValue(new Promise((r) => (resolve = r)))

    let done!: Promise<void>
    act(() => {
      done = result.current.moveTask('t1', DONE_COLUMN_ID)
    })
    expect(storage.update).toHaveBeenCalledWith('t1', { done: true })
    expect(result.current.tasks[0].done).toBe(true)

    await act(async () => {
      resolve({ ...tasks[0], done: true })
      await done
    })
    expect(result.current.tasks[0].done).toBe(true)
  })

  it('moves to a category with { category, done: false }', async () => {
    const result = await renderBoard()
    storage.update.mockResolvedValue({ ...tasks[1], category: 'c', done: false })
    await act(() => result.current.moveTask('t2', 'c'))
    expect(storage.update).toHaveBeenCalledWith('t2', { category: 'c', done: false })
    expect(result.current.tasks[1]).toMatchObject({ category: 'c', done: false })
  })

  it('rolls back the task when the storage call fails', async () => {
    const result = await renderBoard()
    storage.update.mockRejectedValue(new Error('nope'))
    await act(() => result.current.moveTask('t1', 'b'))
    expect(result.current.tasks[0]).toEqual(tasks[0])
    expect(result.current.error).toMatch(/moved/)
  })

  it('does nothing when dropped on its own column or for an unknown task', async () => {
    const result = await renderBoard()
    await act(() => result.current.moveTask('t1', 'a'))
    await act(() => result.current.moveTask('t2', DONE_COLUMN_ID))
    await act(() => result.current.moveTask('zzz', 'a'))
    expect(storage.update).not.toHaveBeenCalled()
  })
})

describe('subtasks', () => {
  // t1 > s1 > s2, plus a checked subtask s3 under t1; t2 is a done root.
  const tree: Task[] = [
    ...tasks,
    { id: 's1', title: 'sub', category: 'a', done: false, parent: 't1', position: 0 },
    { id: 's2', title: 'subsub', category: 'a', done: false, parent: 's1', position: 0 },
    { id: 's3', title: 'checked sub', category: 'a', done: true, parent: 't1', position: 0 },
  ]

  async function renderTree() {
    storage.getAll.mockResolvedValue(tree)
    const view = renderHook(() => useBoard())
    await waitFor(() => expect(view.result.current.tasks).toHaveLength(tree.length))
    return view.result
  }

  it('addTask passes the parent id', async () => {
    const result = await renderTree()
    storage.create.mockResolvedValue({ id: 's4', title: 'new', category: 'a', done: false, parent: 's2' })
    await act(() => result.current.addTask('new', 'a', 's2'))
    expect(storage.create).toHaveBeenCalledWith('new', 'a', 's2')
    expect(result.current.tasks.at(-1)?.parent).toBe('s2')
  })

  it('deleteTask hides the whole subtree; undoDelete restores it in place', async () => {
    const result = await renderTree()
    vi.useFakeTimers()
    try {
      act(() => result.current.deleteTask('s1'))
      act(() => vi.advanceTimersByTime(LEAVE_DURATION_MS))
      expect(ids(result.current.tasks)).toEqual(['t1', 't2', 's3'])
      act(() => result.current.undoDelete())
      expect(ids(result.current.tasks)).toEqual(ids(tree))
    } finally {
      vi.useRealTimers()
    }
  })

  it('clearDone keeps a checked subtask under a not-done parent', async () => {
    const result = await renderTree()
    storage.clearDone.mockResolvedValue(1)
    await act(() => result.current.clearDone())
    expect(ids(result.current.tasks)).toEqual(['t1', 's1', 's2', 's3'])
  })

  it('clearCategory removes the not-done roots with all their subtasks', async () => {
    const result = await renderTree()
    storage.clearCategory.mockResolvedValue(4)
    await act(() => result.current.clearCategory('a'))
    expect(ids(result.current.tasks)).toEqual(['t2'])
  })

  it('checking a task checks its whole subtree; unchecking leaves the subtasks', async () => {
    const result = await renderTree()
    storage.update.mockResolvedValue({ ...tree[2], done: true })
    await act(() => result.current.changeTask('s1', { done: true }))
    expect(result.current.tasks.filter((t) => t.done).map((t) => t.id)).toEqual(['t2', 's1', 's2', 's3'])

    storage.update.mockResolvedValue({ ...tree[2], done: false })
    await act(() => result.current.changeTask('s1', { done: false }))
    expect(result.current.tasks.find((t) => t.id === 's2')?.done).toBe(true)
  })

  it('moving to Done checks the subtree; rollback restores it', async () => {
    const result = await renderTree()
    storage.update.mockRejectedValue(new Error('nope'))
    await act(() => result.current.moveTask('t1', DONE_COLUMN_ID))
    expect(result.current.tasks).toEqual(tree)

    storage.update.mockResolvedValue({ ...tree[0], done: true })
    await act(() => result.current.moveTask('t1', DONE_COLUMN_ID))
    expect(result.current.tasks.every((t) => t.done)).toBe(true)
  })

  it('moving a root moves its subtasks; moving a subtask detaches it', async () => {
    const result = await renderTree()
    storage.update.mockResolvedValue({ ...tree[0], category: 'c' })
    await act(() => result.current.moveTask('t1', 'c'))
    expect(result.current.tasks.filter((t) => t.category === 'c').map((t) => t.id)).toEqual(['t1', 's1', 's2', 's3'])

    storage.update.mockResolvedValue({ ...tree[3], category: 'b', parent: null })
    await act(() => result.current.moveTask('s2', 'b'))
    expect(storage.update).toHaveBeenLastCalledWith('s2', { category: 'b', done: false, parent: null })
  })

  it('nestTask moves the subtree under the target, inheriting its category and done', async () => {
    const result = await renderTree()
    storage.update.mockResolvedValue({ ...tree[2], category: 'b', done: true, parent: 't2' })
    await act(() => result.current.nestTask('s1', 't2'))
    expect(storage.update).toHaveBeenCalledWith('s1', { parent: 't2' })
    const byId = (id: string) => result.current.tasks.find((t) => t.id === id)
    expect(byId('s1')).toMatchObject({ parent: 't2', category: 'b', done: true })
    expect(byId('s2')).toMatchObject({ parent: 's1', category: 'b', done: true })
    expect(byId('s3')).toEqual(tree[4])
  })

  it('nestTask rolls back the subtree when the storage call fails', async () => {
    const result = await renderTree()
    storage.update.mockRejectedValue(new Error('nope'))
    await act(() => result.current.nestTask('s1', 't2'))
    expect(result.current.tasks).toEqual(tree)
    expect(result.current.error).toMatch(/moved/)
  })

  it('nestTask does nothing under itself, its own subtask, its current parent or an unknown task', async () => {
    const result = await renderTree()
    await act(() => result.current.nestTask('t1', 't1'))
    await act(() => result.current.nestTask('t1', 's2'))
    await act(() => result.current.nestTask('s1', 't1'))
    await act(() => result.current.nestTask('s1', 'zzz'))
    expect(storage.update).not.toHaveBeenCalled()
    expect(result.current.tasks).toEqual(tree)
  })
})

describe('categories', () => {
  it('addCategory validates the length and inserts before Other', async () => {
    const result = await renderBoard()
    let ok = true
    await act(async () => {
      ok = await result.current.addCategory('x')
    })
    expect(ok).toBe(false)
    expect(result.current.error).toMatch(/2 to 20/)
    await act(async () => {
      ok = await result.current.addCategory('x'.repeat(21))
    })
    expect(ok).toBe(false)
    expect(storage.createCategory).not.toHaveBeenCalled()

    storage.createCategory.mockResolvedValue({ id: 'd', name: 'Dev' })
    await act(async () => {
      ok = await result.current.addCategory('Dev')
    })
    expect(ok).toBe(true)
    expect(ids(result.current.categories)).toEqual(['a', 'b', 'c', 'd', 'other'])
    expect(result.current.error).toBeNull()
  })

  it('deleteCategory moves its tasks to Other; keeps everything on failure', async () => {
    const result = await renderBoard()
    storage.removeCategory.mockRejectedValueOnce(new Error('nope'))
    await act(() => result.current.deleteCategory('a'))
    expect(ids(result.current.categories)).toEqual(ids(categories))
    expect(result.current.error).toMatch(/deleted/)

    storage.removeCategory.mockResolvedValue(undefined)
    await act(() => result.current.deleteCategory('a'))
    expect(storage.removeCategory).toHaveBeenCalledWith('a')
    expect(ids(result.current.categories)).toEqual(['b', 'c', 'other'])
    expect(result.current.tasks[0].category).toBe('other')
  })
})

describe('reorderTask', () => {
  // Three roots in A, in this order.
  const list: Task[] = ['r1', 'r2', 'r3'].map((id, position) => ({ id, title: id, category: 'a', done: false, parent: null, position }))
  const inA = (before: string | null) => ({ parent: null, category: 'a', before })

  async function renderList() {
    storage.getAll.mockResolvedValue(list)
    const view = renderHook(() => useBoard())
    await waitFor(() => expect(view.result.current.tasks).toHaveLength(list.length))
    return view.result
  }
  const order = (all: Task[]) => ids(all.filter((t) => t.category === 'a').toSorted((x, y) => x.position - y.position))

  it('moves a task before another one and sends its index among the others', async () => {
    const result = await renderList()
    storage.update.mockResolvedValue({ ...list[0], position: 1 })
    await act(() => result.current.reorderTask('r1', inA('r3')))
    expect(storage.update).toHaveBeenCalledWith('r1', { position: 1 })
    expect(order(result.current.tasks)).toEqual(['r2', 'r1', 'r3'])
  })

  it('the end gap puts it last', async () => {
    const result = await renderList()
    storage.update.mockResolvedValue({ ...list[0], position: 2 })
    await act(() => result.current.reorderTask('r1', inA(null)))
    expect(storage.update).toHaveBeenCalledWith('r1', { position: 2 })
    expect(order(result.current.tasks)).toEqual(['r2', 'r3', 'r1'])
  })

  it('moving to another column sends the category', async () => {
    const result = await renderList()
    storage.update.mockResolvedValue({ ...list[2], category: 'b', position: 0 })
    await act(() => result.current.reorderTask('r3', { parent: null, category: 'b', before: null }))
    expect(storage.update).toHaveBeenCalledWith('r3', { position: 0, category: 'b' })
  })

  it('does nothing when dropped right before or right after itself', async () => {
    const result = await renderList()
    await act(() => result.current.reorderTask('r2', inA('r2')))
    await act(() => result.current.reorderTask('r2', inA('r3')))
    await act(() => result.current.reorderTask('r3', inA(null)))
    expect(storage.update).not.toHaveBeenCalled()
  })

  it('rolls back when the storage call fails', async () => {
    const result = await renderList()
    storage.update.mockRejectedValue(new Error('down'))
    await act(() => result.current.reorderTask('r3', inA('r1')))
    expect(order(result.current.tasks)).toEqual(['r1', 'r2', 'r3'])
    expect(result.current.error).toMatch(/moved/)
  })
})
