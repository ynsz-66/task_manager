import { useEffect, useRef, useState } from 'react'
import type { Category, Task } from '../types'
import { taskStorage, type TaskChanges } from '../services/taskStorage'
import { CATEGORY_NAME_MAX, CATEGORY_NAME_MIN, DEFAULT_CATEGORY_NAME, DONE_COLUMN_ID, LEAVE_DURATION_MS, UNDO_DELAY_MS } from '../constants'

export type Board = ReturnType<typeof useBoard>

export function useBoard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [freshId, setFreshId] = useState<string | null>(null)
  const [leavingId, setLeavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Deleted task the user can still restore: the API call waits UNDO_DELAY_MS.
  const [deletedTask, setDeletedTask] = useState<Task | null>(null)
  // `removed`: the task and its subtasks, with their index in the list.
  const pendingDelete = useRef<{ task: Task; removed: Removed[]; leaveTimer: number; commitTimer: number } | null>(null)

  useEffect(() => {
    taskStorage
      .getCategories()
      .then(setCategories)
      .catch(() => setError('Couldn’t load the categories. Check that the backend is running.'))
  }, [])

  useEffect(() => {
    taskStorage
      .getAll()
      .then(setTasks)
      .catch(() => setError('Couldn’t load the tasks. Check that the backend is running.'))
  }, [])

  /** Returns true if the task was created (the form can then be cleared). With a `parentId`, adds a subtask. */
  async function addTask(title: string, categoryId: string, parentId?: string) {
    if (!title) return false
    try {
      const task = await taskStorage.create(title, categoryId, parentId)
      setTasks((prev) => [...prev, task])
      setFreshId(task.id)
      setError(null)
      return true
    } catch {
      setError('The task wasn’t added. Try again.')
      return false
    }
  }

  /** Returns true if the category was created (the form can then be cleared). */
  async function addCategory(name: string) {
    if (!name) return false
    if (name.length < CATEGORY_NAME_MIN || name.length > CATEGORY_NAME_MAX) {
      setError(`The category name must be ${CATEGORY_NAME_MIN} to ${CATEGORY_NAME_MAX} characters.`)
      return false
    }
    try {
      const category = await taskStorage.createCategory(name)
      // Inserted just before Other, which stays last.
      setCategories((prev) => {
        const fallbackIndex = prev.findIndex((c) => c.name === DEFAULT_CATEGORY_NAME)
        return fallbackIndex === -1 ? [...prev, category] : prev.toSpliced(fallbackIndex, 0, category)
      })
      setError(null)
      return true
    } catch {
      setError('The category wasn’t added. Try again.')
      return false
    }
  }

  async function deleteCategory(id: string) {
    const fallback = categories.find((c) => c.name === DEFAULT_CATEGORY_NAME)
    if (!fallback) return
    try {
      await taskStorage.removeCategory(id)
      // The backend moved the category's tasks to Other: do the same locally.
      setTasks((prev) => prev.map((t) => (t.category === id ? { ...t, category: fallback.id } : t)))
      setCategories((prev) => prev.filter((c) => c.id !== id))
      setError(null)
    } catch {
      setError('The category wasn’t deleted. Try again.')
    }
  }

  /** Moves a category into the slot before the column at index `slot` (Other stays last). */
  async function moveCategory(id: string, slot: number) {
    const from = categories.findIndex((c) => c.id === id)
    if (from === -1) return
    const target = slot > from ? slot - 1 : slot
    if (target === from) return

    // Optimistic move, rolled back if the API fails.
    const previous = categories
    setCategories(previous.toSpliced(from, 1).toSpliced(target, 0, previous[from]))
    try {
      await taskStorage.updateCategory(id, { order: target })
      setError(null)
    } catch {
      setCategories(previous)
      setError('The category wasn’t moved. Try again.')
    }
  }

  /** Renames a category (optimistic). An empty or unchanged name does nothing. */
  async function renameCategory(id: string, name: string) {
    const previous = categories
    const category = previous.find((c) => c.id === id)
    if (!category || !name || name === category.name) return
    if (name.length < CATEGORY_NAME_MIN || name.length > CATEGORY_NAME_MAX) {
      setError(`The category name must be ${CATEGORY_NAME_MIN} to ${CATEGORY_NAME_MAX} characters.`)
      return
    }
    setCategories(previous.map((c) => (c.id === id ? { ...c, name } : c)))
    try {
      await taskStorage.updateCategory(id, { name })
      setError(null)
    } catch {
      setCategories(previous)
      setError('The category wasn’t renamed. Try again.')
    }
  }

  async function clearDone() {
    await commitDelete()
    try {
      await taskStorage.clearDone()
      // A checked subtask stays under its not-done parent.
      setTasks((prev) => {
        const ids = subtreeIds(prev, (t) => t.done && !t.parent)
        return prev.filter((t) => !ids.has(t.id))
      })
      setError(null)
    } catch {
      setError('The done tasks weren’t deleted. Try again.')
    }
  }

  /** Deletes the category's not-done tasks (done ones stay in the Done column). */
  async function clearCategory(id: string) {
    await commitDelete()
    try {
      await taskStorage.clearCategory(id)
      setTasks((prev) => {
        const ids = subtreeIds(prev, (t) => !t.done && !t.parent && t.category === id)
        return prev.filter((t) => !ids.has(t.id))
      })
      setError(null)
    } catch {
      setError('The tasks weren’t deleted. Try again.')
    }
  }

  async function changeTask(id: string, changes: TaskChanges) {
    // Checking a task checks its subtasks too (the backend does the same).
    const subtree = changes.done ? subtreeIds(tasks, (t) => t.id === id) : new Set<string>()
    try {
      const updated = await taskStorage.update(id, changes)
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : subtree.has(t.id) ? { ...t, done: true } : t)))
      setEditingId(null)
      setError(null)
    } catch {
      setError('The task wasn’t updated. Try again.')
    }
  }

  /** Sends the pending deletion to the API now; restores the task if it fails. */
  async function commitDelete() {
    const pending = pendingDelete.current
    if (!pending) return
    clearTimeout(pending.commitTimer)
    pendingDelete.current = null
    setDeletedTask(null)
    try {
      await taskStorage.remove(pending.task.id)
    } catch {
      setTasks((prev) => insertTasks(prev, pending.removed))
      setError('The task wasn’t deleted. Try again.')
    }
  }

  /** Hides the task and its subtasks at once; the API deletes them after UNDO_DELAY_MS unless undoDelete is called. */
  function deleteTask(id: string) {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    // One undo at a time: the previous deletion becomes final.
    void commitDelete()
    const ids = subtreeIds(tasks, (t) => t.id === id)
    const removed = tasks.flatMap((t, index) => (ids.has(t.id) ? [{ task: t, index }] : []))
    // The task (its subtasks are inside it) plays its exit animation before being removed from the list.
    setLeavingId(id)
    const leaveTimer = window.setTimeout(() => {
      setTasks((prev) => prev.filter((t) => !ids.has(t.id)))
      setLeavingId((current) => (current === id ? null : current))
    }, LEAVE_DURATION_MS)
    const commitTimer = window.setTimeout(commitDelete, UNDO_DELAY_MS)
    pendingDelete.current = { task, removed, leaveTimer, commitTimer }
    setDeletedTask(task)
  }

  function undoDelete() {
    const pending = pendingDelete.current
    if (!pending) return
    clearTimeout(pending.leaveTimer)
    clearTimeout(pending.commitTimer)
    pendingDelete.current = null
    setDeletedTask(null)
    setLeavingId((current) => (current === pending.task.id ? null : current))
    setTasks((prev) => insertTasks(prev, pending.removed))
  }

  /** Moves a task to a column (category or Done). */
  async function moveTask(taskId: string, columnId: string) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    const changes: TaskChanges = columnId === DONE_COLUMN_ID ? { done: true } : { category: columnId, done: false }
    if (task.done === changes.done && (changes.category ?? task.category) === task.category) return
    // Dropped on a column, a subtask leaves its parent and becomes a root task.
    if (task.parent) changes.parent = null

    // Optimistic move: the task changes column right away (its subtasks follow, and are checked with it in Done),
    // rolled back if the API fails.
    const subtree = subtreeIds(tasks, (t) => t.id === task.id)
    const before = new Map(tasks.filter((t) => subtree.has(t.id)).map((t) => [t.id, t]))
    const cascade: TaskChanges = { ...(changes.category && { category: changes.category }), ...(changes.done && { done: true }) }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...changes } : subtree.has(t.id) ? { ...t, ...cascade } : t)))
    try {
      const updated = await taskStorage.update(task.id, changes)
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      setError(null)
    } catch {
      setTasks((prev) => prev.map((t) => before.get(t.id) ?? t))
      setError('The task wasn’t moved. Try again.')
    }
  }

  /** Makes a task a subtask of another one: it takes the parent's category, and is checked if the parent is. */
  async function nestTask(taskId: string, parentId: string) {
    const task = tasks.find((t) => t.id === taskId)
    const parent = tasks.find((t) => t.id === parentId)
    if (!task || !parent || task.parent === parentId) return
    const subtree = subtreeIds(tasks, (t) => t.id === task.id)
    // A task can't go under itself or one of its subtasks.
    if (subtree.has(parentId)) return

    // Optimistic, rolled back if the API fails (same as moveTask).
    const before = new Map(tasks.filter((t) => subtree.has(t.id)).map((t) => [t.id, t]))
    const cascade: TaskChanges = { category: parent.category, ...(parent.done && { done: true }) }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...cascade, parent: parentId } : subtree.has(t.id) ? { ...t, ...cascade } : t)))
    try {
      const updated = await taskStorage.update(task.id, { parent: parentId })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      setError(null)
    } catch {
      setTasks((prev) => prev.map((t) => before.get(t.id) ?? t))
      setError('The task wasn’t moved. Try again.')
    }
  }

  /** Drops a task into a gap of a list (a column's roots, or a task's subtasks): before `gap.before`, or at the end if null. */
  async function reorderTask(taskId: string, gap: Gap) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    const subtree = subtreeIds(tasks, (t) => t.id === taskId)
    // A task can't go into its own subtree.
    if (gap.parent && subtree.has(gap.parent)) return

    // The target list, in display order. Root lists also hold their done tasks (hidden in the Done column):
    // the backend counts them too.
    const list = tasks
      .filter((t) => t.parent === gap.parent && (gap.parent !== null || t.category === gap.category))
      .toSorted((a, b) => a.position - b.position)
    const from = list.findIndex((t) => t.id === taskId)
    // Already shown in this list (a done root shows in Done, not here: moving it still unchecks it).
    const alreadyHere = from !== -1 && !(gap.parent === null && task.done)
    const siblings = list.filter((t) => t.id !== taskId)
    // Gap right before itself: nowhere to go.
    if (gap.before === taskId) return
    const position = gap.before === null ? siblings.length : siblings.findIndex((t) => t.id === gap.before)
    // `before` not in the list (stale gap), or the task already sits there.
    if (position === -1 || (alreadyHere && position === from)) return

    const changes: TaskChanges = { position }
    if (gap.parent !== task.parent) changes.parent = gap.parent
    if (gap.parent === null && gap.category !== task.category) changes.category = gap.category
    // A root gap is in a category column: the task leaves Done.
    if (gap.parent === null && task.done) changes.done = false

    // Optimistic: siblings renumbered 0..n-1 like the backend, subtree in the gap's category; rolled back on failure.
    const positions = new Map(siblings.toSpliced(position, 0, task).map((t, i) => [t.id, i]))
    const previous = tasks
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, ...changes, category: gap.category }
          : positions.has(t.id)
            ? { ...t, position: positions.get(t.id)! }
            : subtree.has(t.id)
              ? { ...t, category: gap.category }
              : t,
      ),
    )
    try {
      const updated = await taskStorage.update(taskId, changes)
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      setError(null)
    } catch {
      setTasks(previous)
      setError('The task wasn’t moved. Try again.')
    }
  }

  return {
    tasks,
    categories,
    editingId,
    setEditingId,
    freshId,
    leavingId,
    error,
    clearError: () => setError(null),
    addTask,
    addCategory,
    deleteCategory,
    moveCategory,
    renameCategory,
    clearDone,
    clearCategory,
    changeTask,
    deleteTask,
    deletedTask,
    undoDelete,
    moveTask,
    nestTask,
    reorderTask,
  }
}

/** A drop zone between two tasks of a list. `category` is the column's (a subtask list's is its parent's). */
export interface Gap {
  parent: string | null
  category: string
  /** Task right after the gap, null for the gap at the end of the list. */
  before: string | null
}

interface Removed {
  task: Task
  index: number
}

/** Puts tasks back at their index (ascending), skipping those still in the list (undo before the exit animation ended). */
function insertTasks(list: Task[], removed: Removed[]) {
  return removed.reduce(
    (acc, { task, index }) => (acc.some((t) => t.id === task.id) ? acc : acc.toSpliced(Math.min(index, acc.length), 0, task)),
    list,
  )
}

/** Ids of the tasks matching `isRoot` and of all their subtasks, at any depth. */
function subtreeIds(list: Task[], isRoot: (task: Task) => boolean) {
  const ids = new Set(list.filter(isRoot).map((t) => t.id))
  // A child can come before its parent in the list (order -1): repeat until nothing is added.
  let size
  do {
    size = ids.size
    for (const t of list) if (t.parent && ids.has(t.parent)) ids.add(t.id)
  } while (ids.size !== size)
  return ids
}
