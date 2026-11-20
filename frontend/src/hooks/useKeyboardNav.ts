import { useEffect, useRef, useState } from 'react'
import { nextSelection, resolveSelection, type NavColumn, type NavKey, type Selection } from '../keyboardNav'

export type Command =
  | 'toggle'
  | 'add'
  | 'addSubtask'
  | 'edit'
  | 'rename'
  | 'delete'
  | 'undo'
  | 'moveDown'
  | 'moveUp'
  | 'moveLeft'
  | 'moveRight'
  | 'indent'
  | 'outdent'
  | 'help'
  | 'stats'
  | 'newCategory'
  | 'palette'

// `e.key`, not `e.code`: the character typed, whatever the keyboard layout.
const COMMANDS: Record<string, Command> = {
  x: 'toggle',
  ' ': 'toggle',
  o: 'add',
  a: 'addSubtask',
  i: 'edit',
  Enter: 'edit',
  r: 'rename',
  dd: 'delete',
  u: 'undo',
  J: 'moveDown',
  K: 'moveUp',
  H: 'moveLeft',
  L: 'moveRight',
  '>': 'indent',
  '<': 'outdent',
  '?': 'help',
  s: 'stats',
  c: 'newCategory',
}
const MOTIONS = new Set<string>(['h', 'j', 'k', 'l', 'gg', 'G'])
/** Time allowed between the two keys of `dd` / `gg`. */
export const PREFIX_TIMEOUT_MS = 500

/** A field where the keys are text. */
/** A key typed into a text field, not a board key. */
export function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  return target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit'].includes(target.type)
}

/** Vim-style keys on the whole page: motions move the selection, the other keys go to `onCommand`. */
export function useKeyboardNav(columns: NavColumn[], onCommand: (command: Command, selection: Selection | null) => void) {
  const [stored, setStored] = useState<Selection | null>(null)
  // False after a click: the clicked task is already in view, so its column must not scroll.
  const [follow, setFollow] = useState(true)
  const selection = resolveSelection(columns, stored)
  const pending = useRef<{ key: string; at: number } | null>(null)

  // Re-subscribed on each render so the handler always sees the current columns.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || document.querySelector('dialog[open]')) return
      // Cmd+K (Ctrl+K off macOS) opens the palette, even from a field. preventDefault: Firefox's search bar.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onCommand('palette', selection)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTyping(e.target)) return
      // Enter / Space keep activating a focused button or checkbox.
      if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof Element && e.target.closest('button, a, input')) return

      let key = e.key
      const prefix = pending.current
      pending.current = null
      if (prefix?.key === key && Date.now() - prefix.at < PREFIX_TIMEOUT_MS) key += key
      else if (key === 'd' || key === 'g') {
        pending.current = { key, at: Date.now() }
        return
      }

      if (key === 'Escape') {
        if (!selection) return
        setStored(null)
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        return
      }
      if (MOTIONS.has(key)) {
        e.preventDefault()
        setStored(nextSelection(columns, selection, key as NavKey))
        setFollow(true)
        return
      }
      const command = COMMANDS[key]
      if (!command) return
      e.preventDefault()
      onCommand(command, selection)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return {
    selection,
    /** Whether the view follows the selection into its column (keys, palette), not after a click. */
    follow,
    /** Select a task by id: `follow` false for a click. */
    selectTask: (id: string, follow = true) => {
      setStored(resolveSelection(columns, { column: '', task: id, index: 0 }))
      setFollow(follow)
    },
    /** Select a column: its first task, or the column itself when empty. */
    selectColumn: (id: string) => {
      setStored({ column: id, task: null, index: 0 })
      setFollow(true)
    },
    /** Keep the row but not the task: the selection goes to whatever task takes its place (checked task leaving). */
    releaseTask: () => setStored(selection && { ...selection, task: null }),
  }
}
