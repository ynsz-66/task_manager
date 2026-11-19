import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  title: string
  children: ReactNode
  onClose: () => void
}

// Info pop-up (native <dialog>, ConfirmDialog styles): Escape, backdrop click or OK close it.
export function Modal({ title, children, onClose }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="confirm"
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="confirm-body">
        <h2 id="modal-title">{title}</h2>
        <p>{children}</p>
        <div className="confirm-actions">
          <button type="button" onClick={onClose} autoFocus>
            OK
          </button>
        </div>
      </div>
    </dialog>
  )
}
