# Tokens de Design

Este documento lista as variáveis CSS de design tokens do ecossistema e como estão mapeados no CSS do Tailwind v4 (`/src/index.css`).

## Cores

- **Background:**
  - `--nf-background-base` (`bg-background-base`): `#070A0F`
  - `--nf-background-deep` (`bg-background-deep`): `#07101D`
- **Surface:**
  - `--nf-surface-default` (`bg-surface-default`): `#0F1724`
  - `--nf-surface-secondary` (`bg-surface-secondary`): `#111E2F`
  - `--nf-surface-elevated` (`bg-surface-elevated`): `#17263A`
  - `--nf-glass-surface`: `rgba(17, 30, 47, 0.72)`
- **Border:**
  - `--nf-border-subtle` (`border-border-subtle`): `rgba(255, 255, 255, 0.08)`
  - `--nf-border-strong` (`border-border-strong`): `rgba(255, 255, 255, 0.14)`
- **Text:**
  - `--nf-text-primary` (`text-text-primary`): `#F7FAFC`
  - `--nf-text-secondary` (`text-text-secondary`): `#AEB9C7`
  - `--nf-text-muted` (`text-text-muted`): `#6B7B8F`
- **Semantic:**
  - `--nf-accent-primary` (`text-accent-primary` / `bg-accent-primary`): `#19D3B0`
  - `--nf-semantic-success`: `#32D583`
  - `--nf-semantic-warning`: `#F5B942`
  - `--nf-semantic-danger`: `#FF667A`

## Tipografia

Utiliza a stack padrão do sistema: `-apple-system, BlinkMacSystemFont, Inter, "Segoe UI", sans-serif`.

## Interações e Motion

Foi utilizada apenas CSS puro para manter o bundle minimalista na fase inicial, desabilitando para quem prefere movimento reduzido:

- `.press-fx`: Transição simples de 100ms que aplica `scale(0.985)` no `active`.
- `.hover-fx`: Fade no hover ou mudança suave de background-color.
- `.fade-in`: Animação de `0` para `100%` de opacidade.
