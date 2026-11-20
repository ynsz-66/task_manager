import { useEffect, useRef, type ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { Category, Task } from '../types'
import type { Gap } from '../hooks/useBoard'
import type { TaskChanges } from '../services/taskStorage'
import { EditForm } from './EditForm'
import { dueLabel, dueStatus } from '../dueDate'

function categoryNameOf(categories: Category[], categoryId: string) {
  return categories.find((c) => c.id === categoryId)?.name ?? ''
}

/** Drop zone between two tasks: dropping a task here reorders it. */
export function TaskGap({ gap }: { gap: Gap }) {
  const id = `gap-${gap.parent ?? gap.category}-${gap.before ?? 'end'}`
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: 'gap', gap } })
  return <li ref={setNodeRef} className={isOver ? 'gap over' : 'gap'} aria-hidden="true" />
}

/** Due date under the title: red once overdue, orange within 24 h, muted when done. Status in words too, not color alone. */
export function DueBadge({ iso, done }: { iso: string; done: boolean }) {
  // shortcut: computed at render, so the color changes on the next render, not exactly at the due time.
  const status = done ? 'later' : dueStatus(iso)
  const label = dueLabel(iso)
  return (
    <time dateTime={iso} className={`due ${status}`}>
      {status === 'overdue' ? `Overdue · ${label}` : label}
    </time>
  )
}

interface TaskItemProps {
  task: Task
  categories: Category[]
  showCategory: boolean
  isFresh: boolean
  isEditing: boolean
  isLeaving: boolean
  isAdding: boolean
  /** Keyboard selection (useKeyboardNav). */
  isSelected: boolean
  /** Subtasks list and add-subtask field, shown under the task. */
  children?: ReactNode
  onChange: (changes: TaskChanges) => void
  onDelete: () => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onAddSubtask: () => void
  onSelect: () => void
}

export function TaskItem({ task, categories, showCategory, isFresh, isEditing, isLeaving, isAdding, isSelected, children, onChange, onDelete, onStartEdit, onCancelEdit, onAddSubtask, onSelect }: TaskItemProps) {
  // No drag while editing or adding a subtask, so the input text can be selected.
  const { setNodeRef: setDragRef, listeners, isDragging } = useDraggable({ id: task.id, disabled: isEditing || isAdding })
  // Dropping another task here makes it a subtask of this one.
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: task.id, data: { type: 'task' } })
  const className = ['task', task.done && 'done', isFresh && 'fresh', isEditing && 'editing', isDragging && 'dragging', isLeaving && 'leaving', isOver && 'over', isSelected && 'selected']
    .filter(Boolean)
    .join(' ')
  const categoryName = categoryNameOf(categories, task.category)
  const ref = useRef<HTMLLIElement | null>(null)

  // The selected row scrolls into view and takes the focus back once its edit or add field closes,
  // unless the focus is somewhere else on purpose (a field, a button outside the board).
  useEffect(() => {
    const node = ref.current
    if (!isSelected || isEditing || isAdding || !node) return
    node.scrollIntoView?.({ block: 'nearest' })
    const active = document.activeElement
    if (!active || active === document.body || active.closest('.task')) node.focus({ preventScroll: true })
  }, [isSelected, isEditing, isAdding])

  return (
    <li
      ref={(node) => {
        setDropRef(node)
        setDragRef(node)
        ref.current = node
      }}
      {...listeners}
      className={className}
      tabIndex={isSelected ? 0 : -1}
      // A click on a subtask selects the subtask, not its parents too.
      onClick={(e) => {
        if (e.target instanceof Element && e.target.closest('.task') === e.currentTarget) onSelect()
      }}
    >
      {isEditing ? (
        <EditForm task={task} onSave={onChange} onCancel={onCancelEdit} />
      ) : (
        <>
          <input
            type="checkbox"
            className="check"
            checked={task.done}
            onChange={(e) => onChange({ done: e.target.checked })}
            aria-label={`Mark “${task.title}” as ${task.done ? 'to do' : 'done'}`}
          />
          <div className="body">
            <span className="title" onDoubleClick={onStartEdit}>{task.title}</span>
            {task.dueDate && <DueBadge iso={task.dueDate} done={task.done} />}
            {showCategory && <span className="tag">{categoryName}</span>}
          </div>
          <div className="actions">
            <div className="actions-inner">
              {!task.done && (
                <button type="button" className="add-subtask" onClick={onAddSubtask} aria-label={`Add a subtask to “${task.title}”`}>
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
              <button type="button" onClick={onStartEdit}>
                Edit
              </button>
              <button type="button" className="delete" onClick={onDelete}>
                Delete
              </button>
            </div>
          </div>
        </>
      )}
      {children}
    </li>
  )
}
