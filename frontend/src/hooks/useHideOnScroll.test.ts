import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SCROLL_THRESHOLD, useHideOnScroll } from './useHideOnScroll'

const HEADER_HEIGHT = 100

/** Moves the page to `y` and fires the scroll event (requestAnimationFrame runs synchronously). */
function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
  act(() => {
    window.dispatchEvent(new Event('scroll'))
  })
}

function renderWithHeader() {
  const header = document.createElement('header')
  Object.defineProperty(header, 'offsetHeight', { value: HEADER_HEIGHT })
  return renderHook(() => useHideOnScroll({ current: header }))
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: 5000, configurable: true })
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
})

afterEach(() => vi.unstubAllGlobals())

describe('useHideOnScroll', () => {
  it('is visible at first', () => {
    const { result } = renderWithHeader()
    expect(result.current).toBe(false)
  })

  it('stays visible while the header height is still within the top of the page', () => {
    const { result } = renderWithHeader()
    scrollTo(HEADER_HEIGHT)
    expect(result.current).toBe(false)
  })

  it('hides on scroll down past the header and shows again on scroll up', () => {
    const { result } = renderWithHeader()
    scrollTo(400)
    expect(result.current).toBe(true)
    scrollTo(400 - SCROLL_THRESHOLD)
    expect(result.current).toBe(false)
    scrollTo(600)
    expect(result.current).toBe(true)
  })

  it('ignores moves smaller than the threshold', () => {
    const { result } = renderWithHeader()
    scrollTo(400)
    scrollTo(400 - SCROLL_THRESHOLD + 1)
    expect(result.current).toBe(true)
  })

  it('shows again when back near the top, even with a small move', () => {
    const { result } = renderWithHeader()
    scrollTo(HEADER_HEIGHT + SCROLL_THRESHOLD / 2)
    expect(result.current).toBe(true)
    // Up by less than the threshold, but the header fits again at the top.
    scrollTo(HEADER_HEIGHT)
    expect(result.current).toBe(false)
  })

  it('ignores rubber-banding past the end of the page', () => {
    const { result } = renderWithHeader()
    const max = 5000 - 800
    scrollTo(max)
    expect(result.current).toBe(true)
    // iOS overscroll: scrollY goes past the end, then bounces back to it.
    scrollTo(max + 60)
    scrollTo(max)
    expect(result.current).toBe(true)
  })

  it('ignores rubber-banding above the top of the page', () => {
    const { result } = renderWithHeader()
    scrollTo(-60)
    expect(result.current).toBe(false)
  })

  it('stops listening once unmounted', () => {
    const { result, unmount } = renderWithHeader()
    unmount()
    scrollTo(400)
    expect(result.current).toBe(false)
  })
})
