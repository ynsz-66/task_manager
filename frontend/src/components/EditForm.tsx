import { useState, type FormEvent } from 'react'
import type { Task } from '../types'
import { submitOnEnter } from './submitOnEnter'

interface EditFormProps {
  task: Task
  onSave: (title: string) => void
  onCancel: () => void
}

export function EditForm({ task, onSave, onCancel }: EditFormProps) {
  const [title, setTitle] = useState(task.title)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (trimmed) onSave(trimmed)
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
      <div className="edit-actions">
        <button type="submit">Save</button>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
