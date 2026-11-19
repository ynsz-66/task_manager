import { useState, type CSSProperties, type ReactNode } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  pointerWithin,
  MouseSensor,
  TouchSensor,
  useSensor,
  rectIntersection,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
} from '@dnd-kit/core'
import type { Board as BoardState } from '../hooks/useBoard'
import type { Task } from '../types'
import { CATEGORY_NAME_MAX, DEFAULT_CATEGORY_NAME, DONE_COLUMN_ID } from '../constants'
import { useKeyboardNav, type Command } from '../hooks/useKeyboardNav'
import { navColumns, outdentGap, shiftGap, siblingsOf, type PaletteItem, type Selection } from '../keyboardNav'
import { AddTaskForm } from './AddTaskForm'
import { Column } from './Column'
import { CommandPalette } from './CommandPalette'
import { RenameField } from './RenameField'
import { TaskGap, TaskItem } from './TaskItem'

// A dragged column only targets the slots between columns. A dragged task targets, under the pointer, a gap between
// tasks (reorder), else a task (nest), else the column it overlaps most.
// closestCenter for columns: the 16 px gaps are too thin to aim at with the pointer.
function collisionDetectionFor(tasks: Task[]): CollisionDetection {
  return (args) => {
    const type = (c: (typeof args.droppableContainers)[number]) => c.data.current?.type
    if (args.active.data.current?.type === 'column') {
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => type(c) === 'slot') })
    }
    // Not onto itself or one of its subtasks (they move with it).
    const dragged = new Set([String(args.active.id)])
    for (let size = 0; size !== dragged.size; ) {
      size = dragged.size
      for (const t of tasks) if (t.parent && dragged.has(t.parent)) dragged.add(t.id)
    }
    const gapTargets = args.droppableContainers.filter((c) => type(c) === 'gap' && !dragged.has(c.data.current?.gap.parent))
    const gapHits = pointerWithin({ ...args, droppableContainers: gapTargets })
    if (gapHits.length > 0) return gapHits
    const taskTargets = args.droppableContainers.filter((c) => type(c) === 'task' && !dragged.has(String(c.id)))
    const hits = pointerWithin({ ...args, droppableContainers: taskTargets })
    if (hits.length > 0) return hits
    return rectIntersection({ ...args, droppableContainers: args.droppableContainers.filter((c) => type(c) === undefined) })
  }
}

interface BoardProps {
  board: BoardState
  onRequestDeleteCategory: (id: string) => void
  onRequestClearDone: () => void
  onRequestClearCategory: (id: string) => void
  onRequestHelp: () => void
  onRequestNewCategory: () => void
  onToggleTheme: () => void
}

export function Board({ board, onRequestDeleteCategory, onRequestClearDone, onRequestClearCategory, onRequestHelp, onRequestNewCategory, onToggleTheme }: BoardProps) {
  const { tasks, categories, freshId, editingId, leavingId } = board
  const [draggedId, setDraggedId] = useState<string | null>(null)
  // Column or task whose add-task field is open (ids are unique across both).
  const [addingIn, setAddingIn] = useState<string | null>(null)
  // Column or task whose name is being edited (double-click, or long press without moving on touch).
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  // Mouse: drag starts after 5 px, so clicks stay clicks.
  // Touch: long press, so scrolling isn't blocked.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  // On release the copy settles into its new place with the bouncy spring from index.css:
  // the drag carried momentum, so a little overshoot is earned.
  const [dropAnimation] = useState<DropAnimation>(() => ({
    duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 225,
    easing: getComputedStyle(document.documentElement).getPropertyValue('--spring-bounce').trim() || 'ease-out',
  }))

  function handleDragStart(event: DragStartEvent) {
    setDraggedId(String(event.active.id))
    // The long press worked: a short tick where the Vibration API exists (Android).
    if (event.activatorEvent.type === 'touchstart') navigator.vibrate?.(10)
  }

  function handleDragEnd({ active, over, delta, activatorEvent }: DragEndEvent) {
    setDraggedId(null)
    // Touch has no double-click: a long press released without moving renames a header or edits a task.
    const isTouch = activatorEvent.type === 'touchstart'
    if (isTouch && Math.hypot(delta.x, delta.y) < 5) {
      if (active.data.current?.type === 'column') setRenamingId(String(active.id))
      else board.setEditingId(String(active.id))
      return
    }
    if (!over) return
    if (over.data.current?.type === 'slot') board.moveCategory(String(active.id), over.data.current.index)
    else if (over.data.current?.type === 'gap') board.reorderTask(String(active.id), over.data.current.gap)
    else if (over.data.current?.type === 'task') board.nestTask(String(active.id), String(over.id))
    else board.moveTask(String(active.id), String(over.id))
  }

  const draggedTask = tasks.find((t) => t.id === draggedId)
  // Display order. Stable sort: ties (legacy tasks) keep the API order, by creation date.
  const sorted = tasks.toSorted((a, b) => a.position - b.position)
  // Columns hold root tasks; subtasks render under their parent. A task whose parent is gone counts as a root.
  const taskIds = new Set(tasks.map((t) => t.id))
  const isRoot = (t: Task) => !t.parent || !taskIds.has(t.parent)
  const draggedIndex = categories.findIndex((c) => c.id === draggedId)
  const draggedCategory = categories[draggedIndex]

  const columns = [
    ...categories.map((category) => ({
      id: category.id,
      name: category.name,
      isDone: false,
      movable: category.name !== DEFAULT_CATEGORY_NAME,
      tasks: sorted.filter((t) => isRoot(t) && t.category === category.id && !t.done),
    })),
    { id: DONE_COLUMN_ID, name: 'Done', isDone: true, movable: false, tasks: sorted.filter((t) => isRoot(t) && t.done) },
  ]

  const { selection, selectTask, selectColumn, releaseTask } = useKeyboardNav(navColumns(columns, sorted, leavingId), runCommand)

  /** A key from useKeyboardNav, on the selected task or column. */
  function runCommand(command: Command, selected: Selection | null) {
    const column = columns.find((c) => c.id === selected?.column)
    const task = tasks.find((t) => t.id === selected?.task)
    if (command === 'help') return onRequestHelp()
    if (command === 'palette') return setPaletteOpen(true)
    if (command === 'newCategory') return onRequestNewCategory()
    if (command === 'undo') return board.undoDelete()
    if (command === 'add') return column && !column.isDone && setAddingIn(column.id)
    if (command === 'rename') return column?.movable && setRenamingId(column.id)
    if (!column || !task) return
    if (command === 'toggle') {
      board.changeTask(task.id, { done: !task.done })
      // A root task leaves the column: the selection stays on the row, on the task below.
      if (column.tasks.includes(task)) releaseTask()
      return
    }
    if (command === 'addSubtask') return !task.done && setAddingIn(task.id)
    if (command === 'edit') return board.setEditingId(task.id)
    if (command === 'delete') return board.deleteTask(task.id)
    // The Done column has no order to change.
    if (column.isDone) return
    if (command === 'moveDown' || command === 'moveUp') {
      const gap = shiftGap(task, sorted, command === 'moveDown' ? 1 : -1)
      if (gap) board.reorderTask(task.id, gap)
    } else if (command === 'moveLeft' || command === 'moveRight') {
      const target = columns[columns.indexOf(column) + (command === 'moveLeft' ? -1 : 1)]
      if (target && !target.isDone) board.moveTask(task.id, target.id)
    } else if (command === 'indent') {
      const siblings = siblingsOf(task, sorted)
      const previous = siblings[siblings.indexOf(task) - 1]
      if (previous) board.nestTask(task.id, previous.id)
    } else if (command === 'outdent') {
      const gap = outdentGap(task, sorted)
      if (gap) board.reorderTask(task.id, gap)
    }
  }

  /** Palette entries: the selected task's and column's commands, then the global ones, then every category and task. */
  function paletteItems(): PaletteItem[] {
    const task = tasks.find((t) => t.id === selection?.task)
    const column = columns.find((c) => c.id === selection?.column)
    const command = (id: Command, label: string, keys: string, detail?: string): PaletteItem => ({
      id,
      label,
      keys,
      detail,
      run: () => runCommand(id, selection),
    })
    const items: PaletteItem[] = []
    if (task) {
      items.push(command('toggle', task.done ? 'Uncheck' : 'Check', 'x', task.title), command('edit', 'Edit', 'i', task.title))
      if (!task.done) items.push(command('addSubtask', 'New subtask', 'a', task.title))
      items.push(command('delete', 'Delete', 'dd', task.title))
      if (!column?.isDone) {
        items.push(
          command('moveUp', 'Move up', 'K', task.title),
          command('moveDown', 'Move down', 'J', task.title),
          command('moveLeft', 'Move to the previous column', 'H', task.title),
          command('moveRight', 'Move to the next column', 'L', task.title),
          command('indent', 'Nest under the task above', '>', task.title),
          command('outdent', 'Take out one level', '<', task.title),
        )
      }
    }
    if (column && !column.isDone) items.push(command('add', 'New task', 'o', column.name))
    if (column?.movable) items.push(command('rename', 'Rename the category', 'r', column.name))
    if (board.deletedTask) items.push(command('undo', 'Undo the delete', 'u', board.deletedTask.title))
    items.push(
      { id: 'new-category', label: 'New category', keys: 'c', run: onRequestNewCategory },
      { id: 'theme', label: 'Toggle the theme', run: onToggleTheme },
      { id: 'help', label: 'Keyboard shortcuts', keys: '?', run: onRequestHelp },
      ...columns.map((c) => ({ id: `col-${c.id}`, label: 'Go to category', detail: c.name, run: () => selectColumn(c.id) })),
      ...sorted.map((t) => ({ id: `task-${t.id}`, label: 'Go to task', detail: t.title, run: () => selectTask(t.id) })),
    )
    return items
  }

  /** Tasks of one list, with a drop gap before each and one at the end (none in the Done column: `parent` undefined). */
  function renderList(list: Task[], showCategory: boolean, parent: string | null | undefined, category: string): ReactNode {
    const gap = (before: string | null) =>
      parent !== undefined && <TaskGap key={`gap-${before ?? 'end'}`} gap={{ parent, category, before }} />
    return [...list.flatMap((t) => [gap(t.id), renderTask(t, showCategory, parent !== undefined)]), gap(null)]
  }

  /** A task with its subtasks, at any depth. */
  function renderTask(task: Task, showCategory: boolean, withGaps: boolean): ReactNode {
    const subtasks = sorted.filter((t) => t.parent === task.id)
    return (
      <TaskItem
        key={task.id}
        task={task}
        categories={categories}
        showCategory={showCategory}
        isFresh={task.id === freshId}
        isEditing={task.id === editingId}
        isLeaving={task.id === leavingId}
        isAdding={task.id === addingIn}
        isSelected={task.id === selection?.task}
        onSelect={() => selectTask(task.id)}
        onChange={(changes) => board.changeTask(task.id, changes)}
        onDelete={() => board.deleteTask(task.id)}
        onStartEdit={() => board.setEditingId(task.id)}
        onCancelEdit={() => board.setEditingId(null)}
        onAddSubtask={() => setAddingIn(task.id)}
      >
        {subtasks.length > 0 && (
          <ul className="subtasks">{renderList(subtasks, false, withGaps ? task.id : undefined, task.category)}</ul>
        )}
        {addingIn === task.id && (
          <AddTaskForm
            categoryName={task.title}
            onAdd={(title) => board.addTask(title, task.category, task.id)}
            onClose={() => setAddingIn(null)}
          />
        )}
      </TaskItem>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionFor(tasks)}
      // An opening gap shifts the tasks below it: re-measure drop zones during the drag.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggedId(null)}
    >
      <main className={draggedCategory ? 'board moving-col' : 'board'}>
        {columns.map((column, index) => (
          <Column
            key={column.id}
            id={column.id}
            isDone={column.isDone}
            movable={column.movable}
            isSelected={selection?.column === column.id && !selection.task}
            slot={column.isDone ? undefined : index}
            slotIdle={draggedIndex !== -1 && (index === draggedIndex || index === draggedIndex + 1)}
            // --i: column rank, for the cascading entrance.
            style={{ '--i': index } as CSSProperties}
            header={
              <>
                {renamingId === column.id ? (
                  <RenameField
                    value={column.name}
                    label={`Rename the ${column.name} category`}
                    className="col-rename"
                    maxLength={CATEGORY_NAME_MAX}
                    onRename={(name) => board.renameCategory(column.id, name)}
                    onClose={() => setRenamingId(null)}
                  />
                ) : (
                  <h2 onDoubleClick={column.movable ? () => setRenamingId(column.id) : undefined}>{column.name}</h2>
                )}
                <div className="col-head-end">
                  {/* The key changes with the count: the counter remounts and replays its bounce. */}
                  <span key={column.tasks.length} className="count" aria-label={`${column.tasks.length} tasks`}>
                    {column.tasks.length}
                  </span>
                  {column.isDone && column.tasks.length > 0 && (
                    <button
                      type="button"
                      className="col-clear"
                      onClick={onRequestClearDone}
                      aria-label="Delete all done tasks"
                    >
                      Clear
                    </button>
                  )}
                  {!column.isDone && column.tasks.length > 1 && (
                    <button
                      type="button"
                      className="col-clear"
                      onClick={() => onRequestClearCategory(column.id)}
                      aria-label={`Delete all tasks in ${column.name}`}
                    >
                      Clear
                    </button>
                  )}
                  {!column.isDone && (
                    <button
                      type="button"
                      className="col-add"
                      onClick={() => setAddingIn(column.id)}
                      aria-label={`Add a task to ${column.name}`}
                    >
                      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                  {!column.isDone && column.name !== DEFAULT_CATEGORY_NAME && (
                    <button
                      type="button"
                      className="col-delete"
                      onClick={() => onRequestDeleteCategory(column.id)}
                      aria-label={`Delete the ${column.name} category`}
                    >
                      ×
                    </button>
                  )}
                </div>
              </>
            }
          >
            {addingIn === column.id && (
              <AddTaskForm
                categoryName={column.name}
                onAdd={(title) => board.addTask(title, column.id)}
                onClose={() => setAddingIn(null)}
              />
            )}

            {column.tasks.length === 0 ? (
              <p className="empty">{column.isDone ? 'Check a task to put it here.' : 'Nothing here yet.'}</p>
            ) : (
              <ul>{renderList(column.tasks, column.isDone, column.isDone ? undefined : null, column.id)}</ul>
            )}
          </Column>
        ))}
      </main>

      {paletteOpen && <CommandPalette items={paletteItems()} onClose={() => setPaletteOpen(false)} />}

      {/* Copy that follows the pointer, rendered outside the columns to sit above them. */}
      <DragOverlay className="drag-overlay" dropAnimation={dropAnimation}>
        {draggedCategory && (
          <div className="col-ghost">
            <div className="col-head">
              <h2>{draggedCategory.name}</h2>
              <span className="count">
                {tasks.filter((t) => t.category === draggedCategory.id && !t.done).length}
              </span>
            </div>
          </div>
        )}
        {draggedTask && (
          <div className="task">
            <span className="check" />
            <div className="body">
              <span className="title">{draggedTask.title}</span>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
