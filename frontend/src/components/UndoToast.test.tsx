import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UNDO_DELAY_MS } from '../constants'
import { UndoToast } from './UndoToast'

describe('UndoToast', () => {
  it('names the deleted task and calls onUndo', () => {
    const onUndo = vi.fn()
    const { container } = render(<UndoToast title="buy milk" onUndo={onUndo} />)
    expect(screen.getByText('“buy milk”')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledOnce()
    // The countdown bar lasts as long as the undo delay.
    const toast = container.firstElementChild as HTMLElement
    expect(toast.style.getPropertyValue('--undo-delay')).toBe(`${UNDO_DELAY_MS}ms`)
  })
})
