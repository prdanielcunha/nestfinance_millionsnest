import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type NestFinanceTheme = 'light' | 'dark';
const STORAGE_KEY = 'nestfinance_theme';
const ThemeContext = createContext<{
  theme: NestFinanceTheme;
  setTheme: (theme: NestFinanceTheme) => void;
} | null>(null);

function readInitialTheme(): NestFinanceTheme {
  // Light is the product default even when the device uses dark appearance.
  // Preference stays on this device without collecting account information.
  if (typeof window === 'undefined') return 'light';
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<NestFinanceTheme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Disabled browser storage must never block financial workflows.
    }
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useNestFinanceTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useNestFinanceTheme must be used inside ThemeProvider');
  return context;
}
