import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadTheme, saveTheme } from '../services/localStorage'
import { usePreferences } from './usePreferences'

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

afterEach(() => vi.restoreAllMocks())

describe('saveTheme', () => {
  it('survives unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => saveTheme('dark')).not.toThrow()
  })
})

describe('loadTheme', () => {
  it('reads the theme from <html data-theme>', () => {
    expect(loadTheme()).toBe('light')
    document.documentElement.dataset.theme = 'dark'
    expect(loadTheme()).toBe('dark')
  })
})

describe('usePreferences', () => {
  it('toggles the theme and persists it', () => {
    const { result } = renderHook(() => usePreferences())
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')

    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
