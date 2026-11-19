import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ShortcutsHelp } from './ShortcutsHelp'

describe('ShortcutsHelp', () => {
  // jsdom has no showModal.
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
  })
  afterEach(cleanup)

  it('lists the shortcuts and closes with OK or Escape', () => {
    const onClose = vi.fn()
    render(<ShortcutsHelp onClose={onClose} />)
    expect(screen.getByText('dd')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    fireEvent(screen.getByRole('dialog', { hidden: true }), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
