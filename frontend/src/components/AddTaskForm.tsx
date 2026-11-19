import { useState, type FormEvent } from 'react'
import { submitOnEnter } from './submitOnEnter'

interface AddTaskFormProps {
  categoryName: string
  onAdd: (title: string) => Promise<boolean>
  onClose: () => void
}

/** A column's inline add field: stays open after Enter to add tasks in a row. */
export function AddTaskForm({ categoryName, onAdd, onClose }: AddTaskFormProps) {
  const [title, setTitle] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (await onAdd(title.trim())) setTitle('')
  }

  return (
    <form className="col-add-form" onSubmit={handleSubmit}>
      <textarea
        rows={1}
        value={title}
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => (e.key === 'Escape' ? onClose() : submitOnEnter(e))}
        onBlur={() => !title.trim() && onClose()}
        placeholder="New task…"
        aria-label={`New task in ${categoryName}`}
        autoFocus
      />
    </form>
  )
}
