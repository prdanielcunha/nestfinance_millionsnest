import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/index.css', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const ctx = readFileSync('src/contexts/ThemeContext.tsx', 'utf8');
const shell = readFileSync('src/app/layouts/ShellLayout.tsx', 'utf8');
const button = readFileSync('src/components/foundation/Button.tsx', 'utf8');
assert.ok(button.includes('hover:bg-text-primary/90') && !button.includes('hover:bg-white'),
  'Primary action hover must preserve foreground/background contrast in both themes');

// WCAG relative luminance: verify the real token pairs, including primary
// controls whose foreground must change when the accent becomes bright cyan.
function luminance(hex: string): number {
  const values = hex.match(/[a-f\d]{2}/gi)!.map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
function overlay(a: string, b: string, opacity: number): string {
  const channels = (hex: string) => hex.match(/[a-f\d]{2}/gi)!.map(value => parseInt(value, 16));
  const foreground = channels(a); const background = channels(b);
  return '#' + foreground.map((value, i) => Math.round(value * opacity + background[i] * (1 - opacity)).toString(16).padStart(2, '0')).join('');
}
for (const selector of [':root', ":root[data-theme='dark']"]) {
  const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
  const token = (name: string) => {
    const value = block.match(new RegExp(`--nf-${name}: (#[a-fA-F0-9]{6});`))?.[1];
    assert.ok(value, `Missing contrast token ${selector}/${name}`);
    return value;
  };
  for (const foreground of ['text-primary', 'text-secondary', 'text-muted', 'accent-primary']) {
    for (const background of ['background-base', 'surface-default', 'surface-secondary']) {
      assert.ok(contrast(token(foreground), token(background)) >= 4.5,
        `WCAG AA contrast failed: ${selector}/${foreground} on ${background}`);
    }
  }
  assert.ok(contrast(token('background-base'), token('accent-primary')) >= 4.5,
    `Primary control text must remain readable in ${selector}`);
  assert.ok(contrast(token('background-base'), token('text-primary')) >= 4.5);
  for (const surface of ['background-base', 'surface-default', 'surface-secondary', 'surface-elevated']) {
    assert.ok(contrast(token('background-base'), overlay(token('text-primary'), token(surface), 0.9)) >= 4.5,
      `Primary action hover must remain readable in ${selector}/${surface}`);
  }
}

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
