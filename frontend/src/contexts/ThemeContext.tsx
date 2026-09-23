import React, { createContext, useContext, useState, useEffect } from 'react'

export type ThemeMode = 'light' | 'dark'

interface ThemeContextType {
  theme: ThemeMode
  isDark: boolean
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('cc_theme') as ThemeMode
        if (saved === 'dark' || saved === 'light') return saved
      } catch (err) {
        console.warn('Could not read cc_theme from localStorage', err)
      }
    }
    return 'light' // Default is always light
  })

  useEffect(() => {
    const isDarkMode = theme === 'dark'
    document.body.classList.toggle('dark-mode', isDarkMode)
    document.documentElement.classList.toggle('dark-mode', isDarkMode)
    try {
      localStorage.setItem('cc_theme', theme)
    } catch (err) {
      console.warn('Could not save cc_theme to localStorage', err)
    }
  }, [theme])

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme)
  }

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
