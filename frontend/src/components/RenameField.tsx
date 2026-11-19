interface RenameFieldProps {
  value: string
  label: string
  className: string
  maxLength?: number
  onRename: (name: string) => void
  onClose: () => void
}

/** Inline field that renames a column: Enter or blur saves, Escape cancels. */
export function RenameField({ value, label, className, maxLength, onRename, onClose }: RenameFieldProps) {
  return (
    <form
      className={className}
      // Headers and tasks are drag handles: pressing in the field must not start a drag.
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault()
        e.currentTarget.querySelector('input')?.blur()
      }}
    >
      <input
        defaultValue={value}
        maxLength={maxLength}
        aria-label={label}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          // Restoring the value makes the blur below a no-op.
          e.currentTarget.value = value
          e.currentTarget.blur()
        }}
        onBlur={(e) => {
          onRename(e.currentTarget.value.trim())
          onClose()
        }}
      />
    </form>
  )
}
