import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types'
import { EditForm } from './EditForm'

const task: Task = { id: 't1', title: 'Call', category: 'a', done: false, parent: null, position: 0, dueDate: null }
const due = new Date(2026, 10, 21, 9, 30).toISOString()

function setup(overrides: Partial<Task> = {}) {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  render(<EditForm task={{ ...task, ...overrides }} onSave={onSave} onCancel={onCancel} />)
  return { onSave, onCancel, save: () => fireEvent.click(screen.getByRole('button', { name: 'Save' })) }
}

describe('EditForm', () => {
  afterEach(cleanup)

  it('sends only the changed fields', () => {
    const { onSave, save } = setup()
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-11-21T09:30' } })
    save()
    expect(onSave).toHaveBeenCalledWith({ dueDate: due })
  })

  it('clears the due date with "No due date"', () => {
    const { onSave, save } = setup({ dueDate: due, title: 'Old' })
    fireEvent.change(screen.getByLabelText('Edit the task'), { target: { value: 'New' } })
    fireEvent.click(screen.getByRole('button', { name: 'No due date' }))
    save()
    expect(onSave).toHaveBeenCalledWith({ title: 'New', dueDate: null })
  })

  it('cancels when nothing changed', () => {
    const { onSave, onCancel, save } = setup({ dueDate: due })
    save()
    expect(onSave).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })
})
