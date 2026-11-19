import type { ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { Category, Task } from '../types'
import type { Gap } from '../hooks/useBoard'
import type { TaskChanges } from '../services/taskStorage'
import { EditForm } from './EditForm'

function categoryNameOf(categories: Category[], categoryId: string) {
  return categories.find((c) => c.id === categoryId)?.name ?? ''
}

/** Drop zone between two tasks: dropping a task here reorders it. */
export function TaskGap({ gap }: { gap: Gap }) {
  const id = `gap-${gap.parent ?? gap.category}-${gap.before ?? 'end'}`
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: 'gap', gap } })
  return <li ref={setNodeRef} className={isOver ? 'gap over' : 'gap'} aria-hidden="true" />
}

interface TaskItemProps {
  task: Task
  categories: Category[]
  showCategory: boolean
  isFresh: boolean
  isEditing: boolean
  isLeaving: boolean
  isAdding: boolean
  /** Subtasks list and add-subtask field, shown under the task. */
  children?: ReactNode
  onChange: (changes: TaskChanges) => void
  onDelete: () => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onAddSubtask: () => void
}

export function TaskItem({ task, categories, showCategory, isFresh, isEditing, isLeaving, isAdding, children, onChange, onDelete, onStartEdit, onCancelEdit, onAddSubtask }: TaskItemProps) {
  // No drag while editing or adding a subtask, so the input text can be selected.
  const { setNodeRef: setDragRef, listeners, isDragging } = useDraggable({ id: task.id, disabled: isEditing || isAdding })
  // Dropping another task here makes it a subtask of this one.
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: task.id, data: { type: 'task' } })
  const className = ['task', task.done && 'done', isFresh && 'fresh', isEditing && 'editing', isDragging && 'dragging', isLeaving && 'leaving', isOver && 'over']
    .filter(Boolean)
    .join(' ')
  const categoryName = categoryNameOf(categories, task.category)

  return (
    <li
      ref={(node) => {
        setDropRef(node)
        setDragRef(node)
      }}
      {...listeners}
      className={className}
    >
      {isEditing ? (
        <EditForm task={task} onSave={(title) => onChange({ title })} onCancel={onCancelEdit} />
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
