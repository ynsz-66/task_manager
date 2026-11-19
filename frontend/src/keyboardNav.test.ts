import { describe, expect, it } from 'vitest'
import type { Task } from './types'
import { navColumns, nextSelection, outdentGap, resolveSelection, shiftGap, type NavColumn } from './keyboardNav'

const task = (id: string, category: string, position: number, parent: string | null = null, done = false): Task => ({
  id,
  title: id,
  category,
  done,
  parent,
  position,
})

// Column a: t1 (with subtasks s1, s2), t2. Column b: empty. Column c: t3.
const sorted = [task('t1', 'a', 0), task('s1', 'a', 0, 't1'), task('s2', 'a', 1, 't1'), task('t2', 'a', 1), task('t3', 'c', 0)]
const roots = (category: string) => sorted.filter((t) => !t.parent && t.category === category)
const columns = navColumns(
  [
    { id: 'a', tasks: roots('a') },
    { id: 'b', tasks: [] },
    { id: 'c', tasks: roots('c') },
  ],
  sorted,
  null,
)

describe('navColumns', () => {
  it('lists each column in display order, subtasks right after their parent', () => {
    expect(columns).toEqual([
      { id: 'a', tasks: ['t1', 's1', 's2', 't2'] },
      { id: 'b', tasks: [] },
      { id: 'c', tasks: ['t3'] },
    ])
  })

  it('skips the leaving task and its subtasks', () => {
    expect(navColumns([{ id: 'a', tasks: roots('a') }], sorted, 't1')[0].tasks).toEqual(['t2'])
  })
})

describe('nextSelection', () => {
  const sel = (column: string, task: string | null, index: number) => ({ column, task, index })

  it('selects the first task of the first column when nothing is selected', () => {
    expect(nextSelection(columns, null, 'j')).toEqual(sel('a', 't1', 0))
  })

  it('moves through subtasks with j / k and stops at the edges', () => {
    expect(nextSelection(columns, sel('a', 't1', 0), 'j')).toEqual(sel('a', 's1', 1))
    expect(nextSelection(columns, sel('a', 't2', 3), 'j')).toEqual(sel('a', 't2', 3))
    expect(nextSelection(columns, sel('a', 't1', 0), 'k')).toEqual(sel('a', 't1', 0))
  })

  it('jumps to the first / last task with gg / G', () => {
    expect(nextSelection(columns, sel('a', 's2', 2), 'gg')).toEqual(sel('a', 't1', 0))
    expect(nextSelection(columns, sel('a', 't1', 0), 'G')).toEqual(sel('a', 't2', 3))
  })

  it('changes column with h / l, through empty columns, keeping the row when it can', () => {
    expect(nextSelection(columns, sel('a', 's2', 2), 'l')).toEqual(sel('b', null, 0))
    expect(nextSelection(columns, sel('b', null, 0), 'l')).toEqual(sel('c', 't3', 0))
    expect(nextSelection(columns, sel('c', 't3', 0), 'l')).toEqual(sel('c', 't3', 0))
    expect(nextSelection(columns, sel('a', 't1', 0), 'h')).toEqual(sel('a', 't1', 0))
  })
})

describe('resolveSelection', () => {
  it('follows a task that moved to another column', () => {
    const moved: NavColumn[] = [
      { id: 'a', tasks: ['t2'] },
      { id: 'c', tasks: ['t1', 't3'] },
    ]
    expect(resolveSelection(moved, { column: 'a', task: 't1', index: 0 })).toEqual({ column: 'c', task: 't1', index: 0 })
  })

  it('falls back to the neighbor at the same row once the task is gone', () => {
    const gone: NavColumn[] = [{ id: 'a', tasks: ['t1', 's1'] }]
    expect(resolveSelection(gone, { column: 'a', task: 't2', index: 3 })).toEqual({ column: 'a', task: 's1', index: 1 })
  })
})

describe('move gaps', () => {
  const s1 = sorted[1]
  const s2 = sorted[2]

  it('moves a task down / up among its siblings, null at the edges', () => {
    expect(shiftGap(s1, sorted, 1)).toEqual({ parent: 't1', category: 'a', before: null })
    expect(shiftGap(s2, sorted, -1)).toEqual({ parent: 't1', category: 'a', before: 's1' })
    expect(shiftGap(sorted[0], sorted, 1)).toEqual({ parent: null, category: 'a', before: null })
    expect(shiftGap(s1, sorted, -1)).toBeNull()
    expect(shiftGap(s2, sorted, 1)).toBeNull()
  })

  it('outdents a subtask right after its parent, not a root task', () => {
    expect(outdentGap(s1, sorted)).toEqual({ parent: null, category: 'a', before: 't2' })
    expect(outdentGap(sorted[0], sorted)).toBeNull()
  })
})
