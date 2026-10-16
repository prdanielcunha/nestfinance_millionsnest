import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/index.css', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const ctx = readFileSync('src/contexts/ThemeContext.tsx', 'utf8');
const shell = readFileSync('src/app/layouts/ShellLayout.tsx', 'utf8');

// Approved default identity and user-controlled night appearance.
assert.ok(css.includes('--nf-background-base: #f6f4ef;'));
assert.ok(css.includes('--nf-surface-default: #ffffff;'));
assert.ok(css.includes('--nf-text-primary: #17242c;'));
assert.ok(css.includes('--nf-accent-primary: #1d4653;'));
assert.ok(css.includes('--nf-brand-gold: #a27736;'));
assert.ok(css.includes("--nf-semantic-success: #21694e;"));
assert.ok(css.includes(":root[data-theme='dark'] {"));
assert.ok(css.includes(":root[data-theme='dark'] .nf-spec-paper {"));
assert.ok(!css.includes('@media (prefers-color-scheme: dark) {\n  .nf-spec-paper {'),
  'Device appearance must not override the user-selected NestFinance theme');
assert.ok(css.includes('color-scheme: light;'));
assert.ok(css.includes('color-scheme: dark;'));
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));

assert.ok(app.includes('<ThemeProvider>'));
assert.ok(ctx.includes("const STORAGE_KEY = 'nestfinance_theme'"));
assert.ok(ctx.includes("return 'light'"), 'Light must be the safe default');
assert.ok(ctx.includes('window.localStorage.setItem(STORAGE_KEY, theme)'));
assert.ok(ctx.includes('document.documentElement.dataset.theme = theme'));
assert.ok(ctx.includes('} catch {'), 'Private browsing / restricted storage must not block UX');

assert.ok(shell.includes('function ThemeSwitcher('));
assert.equal(shell.split('<ThemeSwitcher language={language} />').length - 1, 2,
  'Appearance selection must be reachable on desktop and mobile');
assert.ok(shell.includes('aria-pressed={theme === value}'));
for (const label of ['Aparência', 'Appearance', 'Apariencia', 'Claro', 'Escuro', 'Light', 'Dark', 'Oscuro']) {
  assert.ok(shell.includes(label), `Untranslated theme copy: ${label}`);
}

console.log('✅ Light/dark design tokens, persistent preference, accessibility and PT/EN/ES integration checks passed');
