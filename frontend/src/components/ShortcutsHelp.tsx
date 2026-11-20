import { useEffect, useRef } from 'react'

const SHORTCUTS: [keys: string[], action: string][] = [
  [['h', 'l'], 'Previous / next column'],
  [['j', 'k'], 'Next / previous task'],
  [['gg', 'G'], 'First / last task'],
  [['x', 'Space'], 'Check / uncheck'],
  [['o'], 'New task in the column'],
  [['a'], 'New subtask'],
  [['i', 'Enter'], 'Edit the title'],
  [['r'], 'Rename the category'],
  [['dd'], 'Delete'],
  [['u'], 'Undo the delete'],
  [['J', 'K'], 'Move down / up'],
  [['H', 'L'], 'Move to the previous / next column'],
  [['>', '<'], 'Nest under the task above / take out one level'],
  [['c'], 'New category'],
  [['s'], 'Dashboard'],
  [['⌘K'], 'Command palette (Ctrl+K)'],
  [['Esc'], 'Clear the selection'],
]

// Keyboard shortcuts pop-up (native <dialog>, same pattern and styles as Modal).
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="confirm shortcuts"
      aria-labelledby="shortcuts-title"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="confirm-body">
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <dl>
          {SHORTCUTS.map(([keys, action]) => (
            <div key={action}>
              <dt>
                {keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
        <div className="confirm-actions">
          <button type="button" onClick={onClose} autoFocus>
            OK
          </button>
        </div>
      </div>
    </dialog>
  )
}
