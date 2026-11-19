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
import { AddTaskForm } from './AddTaskForm'
import { Column } from './Column'
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
}

export function Board({ board, onRequestDeleteCategory, onRequestClearDone, onRequestClearCategory }: BoardProps) {
  const { tasks, categories, freshId, editingId, leavingId } = board
  const [draggedId, setDraggedId] = useState<string | null>(null)
  // Column or task whose add-task field is open (ids are unique across both).
  const [addingIn, setAddingIn] = useState<string | null>(null)
  // Column or task whose name is being edited (double-click, or long press without moving on touch).
  const [renamingId, setRenamingId] = useState<string | null>(null)
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
