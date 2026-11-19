import type { CSSProperties, ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'

interface ColumnProps {
  id: string
  isDone: boolean
  /** The header drags the column (not for Other and Done). */
  movable: boolean
  /** Index of the drop slot in the gap before the column (none for Done). */
  slot?: number
  /** The slot would leave the dragged column where it is: kept droppable, but not shown. */
  slotIdle?: boolean
  header: ReactNode
  style?: CSSProperties
  children: ReactNode
}

export function Column({ id, isDone, movable, slot, slotIdle, header, style, children }: ColumnProps) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id })
  const {
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    listeners,
    isDragging,
  } = useDraggable({ id, data: { type: 'column' }, disabled: !movable })
  const className = ['col', isDone && 'col-done', movable && 'movable', isOver && 'over', isDragging && 'dragging']
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
