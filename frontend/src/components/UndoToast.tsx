import type { CSSProperties } from 'react'
import { UNDO_DELAY_MS } from '../constants'

interface UndoToastProps {
  title: string
  onUndo: () => void
}

/** Shown while a deleted task can be restored; the bar under it counts down the delay. */
export function UndoToast({ title, onUndo }: UndoToastProps) {
  return (
    <div className="toast" style={{ '--undo-delay': `${UNDO_DELAY_MS}ms` } as CSSProperties}>
      <span className="toast-text">
        Deleted <span className="toast-title">“{title}”</span>
      </span>
      <button type="button" className="toast-undo" onClick={onUndo}>
        Undo
      </button>
    </div>
  )
}
