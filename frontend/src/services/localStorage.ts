const THEME_KEY = 'theme'

export type Theme = 'light' | 'dark'

export function loadTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Storage unavailable: the theme stays valid for the session.
  }
}
