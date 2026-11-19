import { useEffect, useRef, useState } from 'react'
import { filterItems, type PaletteItem } from '../keyboardNav'

// Cmd/Ctrl+K palette (native <dialog>, ConfirmDialog styles): type to filter, ↑ ↓ to pick, Enter to run.
export function CommandPalette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const shown = filterItems(items, query)
  const current = Math.min(active, shown.length - 1)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  useEffect(() => {
    listRef.current?.children[current]?.scrollIntoView?.({ block: 'nearest' })
  }, [current])

  function run(item: PaletteItem | undefined) {
    if (!item) return
    // Close the modal first: the board behind is inert while it is open, so a field there couldn't take the focus.
    ref.current?.close()
    onClose()
    item.run()
  }

  return (
    <dialog
      ref={ref}
      className="confirm palette"
      aria-label="Command palette"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <input
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={shown[current] && `palette-${shown[current].id}`}
        aria-label="Search a command, a task or a category"
        placeholder="Search a command, a task or a category"
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onKeyDown={(e) => {
          const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
          if (step) {
            e.preventDefault()
            setActive((current + step + shown.length) % Math.max(shown.length, 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            run(shown[current])
          }
        }}
      />
      <ul ref={listRef} id="palette-list" role="listbox">
        {shown.map((item, i) => (
          <li
            key={item.id}
            id={`palette-${item.id}`}
            role="option"
            aria-selected={i === current}
            onMouseMove={() => setActive(i)}
            onClick={() => run(item)}
          >
            <span className="palette-label">
              {item.label}
              {item.detail && <span className="palette-detail">{item.detail}</span>}
            </span>
            {item.keys && <kbd>{item.keys}</kbd>}
          </li>
        ))}
        {shown.length === 0 && <li className="palette-empty">No match</li>}
      </ul>
    </dialog>
  )
}
