import { Moon, Sun } from 'lucide-react';
import { useNestFinanceTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';

/** Always reachable, including before login. Changes this device's appearance only. */
export function ThemeToggle() {
  const { theme, setTheme } = useNestFinanceTheme(); const { language } = useLanguage();
  const labels = { PT: { dark: 'Ativar modo escuro', light: 'Ativar modo claro' },
    EN: { dark: 'Use dark mode', light: 'Use light mode' },
    ES: { dark: 'Activar modo oscuro', light: 'Activar modo claro' } }[language];
  const dark = theme === 'dark'; const Icon = dark ? Sun : Moon;
  return <button type="button" aria-label={dark ? labels.light : labels.dark} title={dark ? labels.light : labels.dark}
    onClick={() => setTheme(dark ? 'light' : 'dark')}
    className="nf-theme-toggle nf-interactive inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border-strong bg-surface-default text-text-primary shadow-sm hover:bg-surface-secondary focus-visible:outline-accent-primary">
    <Icon className="h-5 w-5" aria-hidden="true" />
  </button>;
}
