import { useRef, useState } from 'react'
import type { Category } from './types'
import { DEFAULT_CATEGORY_NAME } from './constants'
import { useBoard } from './hooks/useBoard'
import { useHideOnScroll } from './hooks/useHideOnScroll'
import { usePreferences } from './hooks/usePreferences'
import { AddForms } from './components/AddForms'
import { Board } from './components/Board'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Modal } from './components/Modal'
import { UndoToast } from './components/UndoToast'
import './App.css'

function App() {
  const { theme, toggleTheme } = usePreferences()
  const board = useBoard()
  const { tasks, categories, error } = board
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [confirmClearDone, setConfirmClearDone] = useState(false)
  const [categoryToClear, setCategoryToClear] = useState<Category | null>(null)
  const headerRef = useRef<HTMLElement>(null)
  const headerHidden = useHideOnScroll(headerRef)

  // Confirm only if the category has tasks (they will be moved to Other).
  function requestDeleteCategory(id: string) {
    const category = categories.find((c) => c.id === id)
    if (!category) return
    if (tasks.some((t) => t.category === id && !t.done)) setCategoryToDelete(category)
    else board.deleteCategory(id)
  }

  const doneCount = tasks.filter((t) => t.done).length
  const clearCount = categoryToClear ? tasks.filter((t) => t.category === categoryToClear.id && !t.done).length : 0
  const categoryTaskCount = categoryToDelete ? tasks.filter((t) => t.category === categoryToDelete.id).length : 0

  return (
    <>
      {/* One translucent bar on top of the board: hides while scrolling down, comes back on scroll up. */}
      <header ref={headerRef} className={headerHidden ? 'top hidden' : 'top'}>
        <div className="top-row">
          <h1>Tasks</h1>
          <div className="prefs">
            <button type="button" className="ghost" onClick={toggleTheme}>
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>
        <AddForms onAddCategory={board.addCategory} />
      </header>

      <Board
        board={board}
        onRequestDeleteCategory={requestDeleteCategory}
        onRequestClearDone={() => setConfirmClearDone(true)}
        onRequestClearCategory={(id) => setCategoryToClear(categories.find((c) => c.id === id) ?? null)}
      />

      {/* Always mounted, so screen readers announce the toast when it appears. */}
      <div className="toast-region" role="status">
        {board.deletedTask && (
          <UndoToast key={board.deletedTask.id} title={board.deletedTask.title} onUndo={board.undoDelete} />
        )}
      </div>

      {categoryToDelete && (
        <ConfirmDialog
          title={`Delete “${categoryToDelete.name}”?`}
          confirmLabel="Delete"
          onConfirm={() => {
            board.deleteCategory(categoryToDelete.id)
            setCategoryToDelete(null)
          }}
          onCancel={() => setCategoryToDelete(null)}
        >
          {categoryTaskCount === 1 ? 'Its task will be moved' : `Its ${categoryTaskCount} tasks will be moved`} to{' '}
          <strong>{DEFAULT_CATEGORY_NAME}</strong>.
        </ConfirmDialog>
      )}

      {error && (
        <Modal key={error} title="Oops" onClose={board.clearError}>
          {error}
        </Modal>
      )}

      {confirmClearDone && (
        <ConfirmDialog
          title={doneCount === 1 ? 'Delete the done task?' : `Delete the ${doneCount} done tasks?`}
          confirmLabel="Delete all"
          onConfirm={() => {
            board.clearDone()
            setConfirmClearDone(false)
          }}
          onCancel={() => setConfirmClearDone(false)}
        >
          They will be permanently deleted.
        </ConfirmDialog>
      )}

      {categoryToClear && (
        <ConfirmDialog
          title={`Delete the ${clearCount} tasks in “${categoryToClear.name}”?`}
          confirmLabel="Delete all"
          onConfirm={() => {
            board.clearCategory(categoryToClear.id)
            setCategoryToClear(null)
          }}
          onCancel={() => setCategoryToClear(null)}
        >
          They will be permanently deleted. Done tasks are kept.
        </ConfirmDialog>
      )}
    </>
  )
}

export default App
