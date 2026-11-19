import { useState, type FormEvent } from 'react'
import { CATEGORY_NAME_MAX } from '../constants'

interface AddFormsProps {
  onAddCategory: (name: string) => Promise<boolean>
}

export function AddForms({ onAddCategory }: AddFormsProps) {
  const [categoryTitle, setCategoryTitle] = useState('')

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault()
    if (await onAddCategory(categoryTitle.trim())) setCategoryTitle('')
  }

  return (
    <section className="add_form">
      <form className="add-form" onSubmit={handleAddCategory}>
        <input
          value={categoryTitle}
          onChange={(e) => setCategoryTitle(e.target.value)}
          placeholder="New category (max 20 characters)"
          aria-label="New category"
          maxLength={CATEGORY_NAME_MAX}
        />
        <button type="submit">Add</button>
      </form>
    </section>
  )
}
