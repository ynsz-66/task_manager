import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { submitOnEnter } from './submitOnEnter'

function keyEvent(key: string, isComposing = false) {
  const requestSubmit = vi.fn()
  const event = {
    key,
    nativeEvent: { isComposing },
    preventDefault: vi.fn(),
    currentTarget: { form: { requestSubmit } },
  } as unknown as KeyboardEvent<HTMLTextAreaElement>
  return { event, requestSubmit }
}

describe('submitOnEnter', () => {
  it('submits the form on Enter instead of inserting a line break', () => {
    const { event, requestSubmit } = keyEvent('Enter')
    submitOnEnter(event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(requestSubmit).toHaveBeenCalled()
  })

  it('ignores other keys and Enter during IME composition', () => {
    for (const { event, requestSubmit } of [keyEvent('a'), keyEvent('Enter', true)]) {
      submitOnEnter(event)
      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(requestSubmit).not.toHaveBeenCalled()
    }
  })
})
