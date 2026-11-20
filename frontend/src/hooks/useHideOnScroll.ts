import { useEffect, useState, type RefObject } from 'react'
import { isTyping } from './useKeyboardNav'

/** Scroll distance (px) needed to change state, so small finger jitter is ignored. */
export const SCROLL_THRESHOLD = 8

/**
 * Hides a sticky bar while the page scrolls down and shows it again as soon as it scrolls up.
 * It never hides while the bar's own height is still within the top of the page.
 * After a board key it stays hidden until the top of the page, so it never covers the keyboard selection;
 * the wheel or a pointer brings back the scroll-up behavior.
 */
export function useHideOnScroll(ref: RefObject<HTMLElement | null>): boolean {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let last = currentScroll()
    let frame = 0
    let keyboard = false

    function update() {
      frame = 0
      const y = currentScroll()
      const delta = y - last
      if (y <= (ref.current?.offsetHeight ?? 0)) {
        setHidden(false)
        last = y
      } else if (keyboard) {
        setHidden(true)
        last = y
      } else if (Math.abs(delta) >= SCROLL_THRESHOLD) {
        setHidden(delta > 0)
        last = y
      }
    }

    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update)
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      keyboard = true
      // Hides right away: a selection that doesn't scroll could be under the bar.
      onScroll()
    }

    function onPointer() {
      keyboard = false
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('wheel', onPointer, { passive: true })
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('wheel', onPointer)
      window.removeEventListener('pointerdown', onPointer)
      cancelAnimationFrame(frame)
    }
  }, [ref])

  return hidden
}

/** scrollY clamped to the scrollable range: iOS rubber-banding goes below 0 and past the end. */
function currentScroll(): number {
  const max = document.documentElement.scrollHeight - window.innerHeight
  return Math.min(Math.max(window.scrollY, 0), Math.max(max, 0))
}
