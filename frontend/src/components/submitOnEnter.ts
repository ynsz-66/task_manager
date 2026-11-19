import type { KeyboardEvent } from 'react'

// Enter submits instead of adding a line break: a task title is a single line.
export function submitOnEnter(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
    e.preventDefault()
    e.currentTarget.form?.requestSubmit()
  }
}
