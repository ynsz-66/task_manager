import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'

interface ColumnProps {
  id: string
  isDone: boolean
  /** The header drags the column (not for Other and Done). */
  movable: boolean
  /** Keyboard selection on the column itself (it has no task). */
  isSelected?: boolean
  /** Index of the drop slot in the gap before the column (none for Done). */
  slot?: number
  /** The slot would leave the dragged column where it is: kept droppable, but not shown. */
  slotIdle?: boolean
  header: ReactNode
  style?: CSSProperties
  children: ReactNode
}

export function Column({ id, isDone, movable, isSelected, slot, slotIdle, header, style, children }: ColumnProps) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id })
  const {
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    listeners,
    isDragging,
  } = useDraggable({ id, data: { type: 'column' }, disabled: !movable })
  // Selected from the keyboard while empty: the task that had the focus lets it go (else its buttons stay shown).
  useEffect(() => {
    if (isSelected && document.activeElement instanceof HTMLElement && document.activeElement.closest('.task')) {
      document.activeElement.blur()
    }
  }, [isSelected])
  const className = ['col', isDone && 'col-done', movable && 'movable', isOver && 'over', isDragging && 'dragging', isSelected && 'selected']
    .filter(Boolean)
    .join(' ')

  return (
    <section
      ref={(node) => {
        setDropRef(node)
        setDragRef(node)
      }}
      className={className}
      style={style}
    >
      {slot !== undefined && <ColumnSlot index={slot} idle={slotIdle} />}
      <header ref={setActivatorNodeRef} className="col-head" {...listeners}>
        {header}
      </header>
      {children}
    </section>
  )
}

function ColumnSlot({ index, idle }: { index: number; idle?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${index}`, data: { type: 'slot', index } })
  const className = ['col-slot', isOver && 'over', idle && 'idle'].filter(Boolean).join(' ')
  return <div ref={setNodeRef} className={className} aria-hidden="true" />
}
