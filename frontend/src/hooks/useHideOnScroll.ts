import { useEffect, useState, type RefObject } from 'react'

/** Scroll distance (px) needed to change state, so small finger jitter is ignored. */
export const SCROLL_THRESHOLD = 8

/**
 * Hides a sticky bar while the page scrolls down and shows it again as soon as it scrolls up.
 * It never hides while the bar's own height is still within the top of the page.
 */
export function useHideOnScroll(ref: RefObject<HTMLElement | null>): boolean {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let last = currentScroll()
    let frame = 0

    function update() {
      frame = 0
      const y = currentScroll()
      const delta = y - last
      if (y <= (ref.current?.offsetHeight ?? 0)) {
        setHidden(false)
        last = y
      } else if (Math.abs(delta) >= SCROLL_THRESHOLD) {
        setHidden(delta > 0)
        last = y
      }
    }

    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
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
