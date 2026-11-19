import { useEffect, useState } from 'react'
import { loadTheme, saveTheme, type Theme } from '../services/localStorage'

export function usePreferences() {
  const [theme, setTheme] = useState<Theme>(loadTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    saveTheme(next)
    setTheme(next)
  }

  return { theme, toggleTheme }
}
