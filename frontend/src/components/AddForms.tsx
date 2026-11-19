import { useState, type FormEvent, type RefObject } from 'react'
import { CATEGORY_NAME_MAX } from '../constants'

interface AddFormsProps {
  onAddCategory: (name: string) => Promise<boolean>
  /** Lets the `c` key focus the field. */
  inputRef?: RefObject<HTMLInputElement | null>
}

export function AddForms({ onAddCategory, inputRef }: AddFormsProps) {
  const [categoryTitle, setCategoryTitle] = useState('')

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault()
    if (await onAddCategory(categoryTitle.trim())) setCategoryTitle('')
  }

  return (
    <section className="add_form">
      <form className="add-form" onSubmit={handleAddCategory}>
        <input
          ref={inputRef}
          value={categoryTitle}
          // Escape gives the keys back to the board.
          onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
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
