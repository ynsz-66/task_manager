import type { Gap } from './hooks/useBoard'
import type { Task } from './types'

/** A column as the keyboard sees it: its tasks' ids in display order (a task, then its subtasks). */
export interface NavColumn {
  id: string
  tasks: string[]
}

/** Selected task, or the column alone when it is empty (`task` null). `index` finds a neighbor once the task is gone. */
export interface Selection {
  column: string
  task: string | null
  index: number
}

export type NavKey = 'h' | 'j' | 'k' | 'l' | 'gg' | 'G'

/** Each column's tasks in display order at any depth, without `skipId` and its subtasks (exit animation). */
export function navColumns(columns: { id: string; tasks: Task[] }[], sorted: Task[], skipId: string | null): NavColumn[] {
  const walk = (list: Task[]): string[] =>
    list.filter((t) => t.id !== skipId).flatMap((t) => [t.id, ...walk(sorted.filter((s) => s.parent === t.id))])
  return columns.map((c) => ({ id: c.id, tasks: walk(c.tasks) }))
}

function at(column: NavColumn, index: number): Selection {
  const i = Math.max(0, Math.min(index, column.tasks.length - 1))
  return { column: column.id, task: column.tasks[i] ?? null, index: i }
}

/** Where the selection is now: the task wherever it moved, else its neighbor at the same row of its column. */
export function resolveSelection(columns: NavColumn[], selection: Selection | null): Selection | null {
  if (!selection) return null
  if (selection.task) {
    for (const c of columns) {
      const i = c.tasks.indexOf(selection.task)
      if (i !== -1) return { column: c.id, task: selection.task, index: i }
    }
  }
  const column = columns.find((c) => c.id === selection.column) ?? columns[0]
  return column ? at(column, selection.index) : null
}

/** Selection after a motion key (`selection` resolved). Nothing selected yet: the first task of the first column. */
export function nextSelection(columns: NavColumn[], selection: Selection | null, key: NavKey): Selection | null {
  if (columns.length === 0) return null
  if (!selection) return at(columns[0], 0)
  const ci = columns.findIndex((c) => c.id === selection.column)
  const column = columns[ci]
  switch (key) {
    case 'j':
      return at(column, selection.index + 1)
    case 'k':
      return at(column, selection.index - 1)
    case 'gg':
      return at(column, 0)
    case 'G':
      return at(column, column.tasks.length - 1)
    case 'h':
      return at(columns[Math.max(ci - 1, 0)], selection.index)
    case 'l':
      return at(columns[Math.min(ci + 1, columns.length - 1)], selection.index)
  }
}

/** The list a task is shown in, in display order: its parent's subtasks, or the root tasks of its column. */
export function siblingsOf(task: Task, sorted: Task[]): Task[] {
  const ids = new Set(sorted.map((t) => t.id))
  const isRoot = (t: Task) => !t.parent || !ids.has(t.parent)
  return isRoot(task)
    ? sorted.filter((t) => isRoot(t) && t.done === task.done && (task.done || t.category === task.category))
    : sorted.filter((t) => t.parent === task.parent)
}

/** Parent as `Gap.parent`: null for a root task (or one whose parent is gone). */
function gapParent(task: Task, sorted: Task[]) {
  return task.parent && sorted.some((t) => t.id === task.parent) ? task.parent : null
}

/** Gap that moves a task one step down (1) or up (-1) among its siblings; null at an edge. */
export function shiftGap(task: Task, sorted: Task[], step: 1 | -1): Gap | null {
  const siblings = siblingsOf(task, sorted)
  const i = siblings.findIndex((t) => t.id === task.id)
  if (i + step < 0 || i + step >= siblings.length) return null
  const before = step === 1 ? (siblings[i + 2]?.id ?? null) : siblings[i - 1].id
  return { parent: gapParent(task, sorted), category: task.category, before }
}

/** Gap right after the task's parent, in the parent's list; null for a root task. */
export function outdentGap(task: Task, sorted: Task[]): Gap | null {
  const parent = sorted.find((t) => t.id === task.parent)
  if (!parent) return null
  const siblings = siblingsOf(parent, sorted)
  const next = siblings[siblings.findIndex((t) => t.id === parent.id) + 1]
  return { parent: gapParent(parent, sorted), category: task.category, before: next?.id ?? null }
}

/** Command palette entry (CommandPalette). */
export interface PaletteItem {
  id: string
  label: string
  /** Muted text after the label (the task a command acts on, a category name). */
  detail?: string
  /** Keyboard shortcut doing the same, shown on the right. */
  keys?: string
  run: () => void
}

/** Lowercase, without accents: "Été" matches "ete". */
function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export function filterItems(items: PaletteItem[], query: string) {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  return items.filter((item) => {
    const text = normalize(`${item.label} ${item.detail ?? ''}`)
    return words.every((w) => text.includes(w))
  })
}
