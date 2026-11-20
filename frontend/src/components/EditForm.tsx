import { useState, type FormEvent } from 'react'
import type { Task } from '../types'
import type { TaskChanges } from '../services/taskStorage'
import { fromLocalInput, toLocalInput } from '../dueDate'
import { submitOnEnter } from './submitOnEnter'

interface EditFormProps {
  task: Task
  /** Only the fields that changed (never empty: no change cancels). */
  onSave: (changes: TaskChanges) => void
  onCancel: () => void
}

export function EditForm({ task, onSave, onCancel }: EditFormProps) {
  const [title, setTitle] = useState(task.title)
  const initialDue = task.dueDate ? toLocalInput(task.dueDate) : ''
  // `datetime-local` value, '' for no due date.
  const [due, setDue] = useState(initialDue)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    const changes: TaskChanges = {
      ...(trimmed !== task.title && { title: trimmed }),
      ...(due !== initialDue && { dueDate: due ? fromLocalInput(due) : null }),
    }
    if (Object.keys(changes).length > 0) onSave(changes)
    else onCancel()
  }

  return (
    <form className="edit" onSubmit={handleSubmit}>
      <textarea
        rows={1}
        value={title}
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={submitOnEnter}
        aria-label="Edit the task"
        autoFocus
      />
      <div className="edit-due">
        <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
        {due && (
          <button type="button" className="ghost" onClick={() => setDue('')}>
            No due date
          </button>
        )}
      </div>
      <div className="edit-actions">
        <button type="submit">Save</button>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
