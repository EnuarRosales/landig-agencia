# Design System — Mocter

Source of truth for visual tokens and component rules. Captured from the project's own CSS; values below are recorded verbatim from their sources (no invented tokens).

## Sources

- `apps/web/app/globals.css` — primary token set (dark default + `.light`), Tailwind v4 `@theme`.
- `apps/admin/app/globals.css` — secondary/admin token set (dark default + `.light`), smaller palette.

## Colors

### Brand (institutional — Brandboard Mocter.pdf) — authoritative for backoffice

| Token | Hex | RGB | Usage |
|---|---|---|---|
| Gris Mocter | `#212121` | 33, 33, 33 | Base dark surfaces / text on light |
| Azul Mocter | `#00C3FF` | 0, 195, 255 | **Primary brand color** (agents, primary actions, links) |
| Blanco | `#FFFFFF` | 255, 255, 255 | Light surfaces / text on dark |
| Naranja Mocter Ventas | `#FF6700` | — | Sales / leads calientes / revenue |
| Verde Mocter Pagos | `#8CFF00` | — | Payments / success / cobros |
| Rosa Mocter Agenda | `#E50C5F` | — | Agenda / citas / scheduling |

Rule: **Azul Mocter (`#00C3FF`) is the primary brand color.** Backoffice shells use the brand palette above; the SaaS backoffice and the tenant backoffice are separate products and must never be mixed in a single view.

### Semantic (dark default) — `apps/web/app/globals.css` (`:root, .dark`)

| Token | Value | Usage |
|---|---|---|
| `--dsn-background` | `#0a0a0b` | Page background |
| `--dsn-surface` | `#121214` | Cards / panels |
| `--dsn-surface-secondary` | `#18181b` | Nested surfaces |
| `--dsn-sidebar` | `rgba(12, 12, 14, 0.72)` | Sidebar / glass nav |
| `--dsn-text` | `#ededef` | Primary text |
| `--dsn-text-secondary` | `#8d8d93` | Secondary text |
| `--dsn-text-tertiary` | `#5c5c63` | Tertiary / muted |
| `--dsn-border` | `rgba(255, 255, 255, 0.09)` | Borders |
| `--dsn-border-subtle` | `rgba(255, 255, 255, 0.05)` | Subtle dividers |
| `--dsn-input-bg` | `#0c121a` | Input background |
| `--dsn-input-border` | `rgba(79, 209, 255, 0.12)` | Input border |
| `--dsn-accent` | `#22d3ee` | Accent (cyan) |
| `--dsn-accent-hover` | `#67e8f9` | Accent hover |
| `--dsn-accent-subtle` | `rgba(34, 211, 238, 0.1)` | Accent subtle bg |
| `--dsn-accent-glow` | `rgba(34, 211, 238, 0.3)` | Accent glow |
| `--dsn-accent-amber` | `#f5a524` | Amber accent |
| `--dsn-accent-purple` | `#b794ff` | Purple accent |
| `--dsn-success` | `#3ddc97` | Success |
| `--dsn-warning` | `#f5a524` | Warning |
| `--dsn-error` | `#ff6b6b` | Error |
| `--dsn-code-bg` | `#0c121a` | Code block bg |

### Semantic (light) — `apps/web/app/globals.css` (`.light, html:not(.dark)`)

| Token | Value |
|---|---|
| `--dsn-background` | `#f9f9f9` |
| `--dsn-surface` | `#ffffff` |
| `--dsn-surface-secondary` | `#f4f4f5` |
| `--dsn-sidebar` | `rgba(250, 250, 250, 0.85)` |
| `--dsn-text` | `#09090b` |
| `--dsn-text-secondary` | `#71717a` |
| `--dsn-text-tertiary` | `#a1a1aa` |
| `--dsn-border` | `rgba(0, 0, 0, 0.08)` |
| `--dsn-border-subtle` | `rgba(0, 0, 0, 0.04)` |
| `--dsn-input-bg` | `#ffffff` |
| `--dsn-input-border` | `#d4d4d8` |
| `--dsn-accent` | `#0891b2` |
| `--dsn-accent-hover` | `#0e7490` |
| `--dsn-accent-subtle` | `rgba(8, 145, 178, 0.08)` |
| `--dsn-accent-glow` | `rgba(8, 145, 178, 0.25)` |
| `--dsn-accent-amber` | `#f59e0b` |
| `--dsn-accent-purple` | `#8b5cf6` |
| `--dsn-success` | `#15803d` |
| `--dsn-warning` | `#a16207` |
| `--dsn-error` | `#dc2626` |
| `--dsn-code-bg` | `#f4f4f5` |

### Brand / surface aliases — `apps/web/app/globals.css`

| Token | Value | Usage |
|---|---|---|
| `--brand-primary` | `#2f6bff` | Brand primary (a1) |
| `--bg` | `#05070f` (dark) / `#f5f8ff` (light) | Page bg alias |
| `--bg2` | `#0a0e1c` / `#ffffff` | Secondary bg |
| `--card` | `rgba(255,255,255,0.045)` / `#ffffff` | Card bg |
| `--card2` | `rgba(255,255,255,0.03)` / `#f0f4fc` | Nested card |
| `--stroke` | `var(--dsn-border)` / `rgba(13,22,44,0.12)` | Border alias |
| `--stroke2` | `var(--dsn-border-subtle)` / `rgba(13,22,44,0.07)` | Subtle border |
| `--txt` | `var(--dsn-text)` | Text alias |
| `--muted` | `var(--dsn-text-secondary)` / `#536280` | Muted text |

### Pipeline (leads) — `apps/web/app/globals.css` `@theme`

| Token | Value |
|---|---|
| `--color-cold` | `#5aa9ff` |
| `--color-warm` | `#ffb63d` |
| `--color-hot` | `#ff6b57` |
| `--color-done` | `#2fd483` |

### WhatsApp

| Token | Value |
|---|---|
| `--color-wa` | `#25d366` |
| `--color-wa2` | `#128c7e` |
| `--color-wa-ink` | `#04231a` |

### Admin app palette — `apps/admin/app/globals.css`

Dark: `--dsn-background #0a0a0a`, `--dsn-surface #121212`, `--dsn-surface-secondary #1a1a1a`, `--dsn-sidebar #0e0e0e`, `--dsn-text #f3f4f6`, `--dsn-text-secondary #a1a1aa`, `--dsn-border #27272a`, `--dsn-accent #14b8a6`, `--dsn-accent-hover #0d9488`, `--dsn-success #22c55e`, `--dsn-warning #f59e0b`, `--dsn-error #ef4444`.
Light: `--dsn-background #f9f9f9`, `--dsn-surface #ffffff`, `--dsn-surface-secondary #f3f4f6`, `--dsn-sidebar #f3f4f6`, `--dsn-text #111827`, `--dsn-text-secondary #4b5563`, `--dsn-border #e5e7eb`, `--dsn-accent #0f766e`, `--dsn-accent-hover #115e59`, `--dsn-success #15803d`, `--dsn-warning #a16207`, `--dsn-error #dc2626`.

## Typography

### Brand (institutional — Brandboard Mocter.pdf) — authoritative for backoffice

| Family | Weight | Usage |
|---|---|---|
| Outfit | Light (200/300) | Titulares y texto |
| Outfit | Medium (500) | Titulares en mayúsculas |
| Geist Mono | 400 / 500 | Etiquetas y datos (KPIs, tablas, códigos) |

Rule: self-host via `next/font` in production (no CDN). Backoffice uses Outfit + Geist Mono.

### Web app (existing) — `apps/web/app/globals.css` `@theme` (DSN-001 §3.2):

| Token | Value |
|---|---|
| `--font-sans` | `var(--font-inter), ui-sans-serif, system-ui, sans-serif` |
| `--font-display` | `var(--brand-font-display)` → `var(--font-chakra-petch), var(--font-sora), ui-sans-serif, system-ui, sans-serif` |
| `--font-mono` | `var(--font-ibm-plex-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` |

Rules (from CSS comments):
- KPIs use display/mono with `tabular-nums`.
- Page titles use text font at 600 (`font-family: var(--font-sans); font-weight: 600`).
- `.kpi-value, .font-mono, [data-tabular="true"]` → `font-variant-numeric: tabular-nums`.

## Spacing

Primitive 4px baseline grid — both `apps/web` and `apps/admin` globals.css:

| Token | Value |
|---|---|
| `--primitive-space-1` | `0.25rem` (4px) |
| `--primitive-space-2` | `0.5rem` (8px) |
| `--primitive-space-3` | `0.75rem` (12px) |
| `--primitive-space-4` | `1rem` (16px) |
| `--primitive-space-6` | `1.5rem` (24px) |
| `--primitive-space-8` | `2rem` (32px) |

## Radius

| Token | Value |
|---|---|
| `--primitive-radius-sm` | `0.375rem` (6px) |
| `--primitive-radius-md` | `0.5rem` (8px) |
| `--primitive-radius-lg` | `0.75rem` (12px) |
| `--primitive-radius-xl` | `1rem` (16px) |
| `--primitive-radius-full` | `9999px` |
| `--radius-card` | `22px` |

## Layout dimensions

| Token | Value |
|---|---|
| `--primitive-sidebar-width` | `260px` |
| `--primitive-content-max-width` | `720px` |
| `--primitive-touch-target` | `44px` |

## Motion

| Token | Value |
|---|---|
| `--primitive-duration-fast` | `150ms` |
| `--primitive-duration-normal` | `200ms` |
| `--primitive-duration-slow` | `240ms` |

Rules: DSN-001 §8 — 150–240ms. Respect `prefers-reduced-motion`.

## Shadows

No dedicated shadow tokens found in sources. Use subtle elevation via surface color + border (`--dsn-border` / `--stroke`). Admin uses Tailwind defaults; web uses `shadow-[0_8px_32px_rgba(0,0,0,0.36)]` for cards (from setup-owner page).

## Component rules

- **Backoffice (SaaS vs inquilino)**: two separate shells; never mix SaaS platform views with tenant views in one screen.
- **Brand primary**: Azul Mocter `#00C3FF` for primary actions/links in backoffice; accent semantic tokens remain for status.
- **Fonts**: Outfit for headings/text, Geist Mono for labels/data in backoffice.
- **Sidebar**: width `260px` (`--primitive-sidebar-width`), dark bg `--dsn-sidebar`, border right `--dsn-border`.
- **Touch targets**: min `44px` (`--primitive-touch-target`).
- **Content max width**: `720px` for forms/content columns.
- **Cards**: radius `22px` (`--radius-card`) or `--primitive-radius-lg` (12px) for compact; border `--dsn-border`; bg `--dsn-surface` / `--card`.
- **Inputs**: bg `--dsn-input-bg`, border `--dsn-input-border`, radius `--primitive-radius-md`.
- **Accent buttons**: bg `--brand-primary` (#2f6bff) or `--dsn-accent` depending on context; hover `--dsn-accent-hover`.
- **KPI values**: mono font, `tabular-nums`.
- **Theme**: dark default; light via `.light` / `html:not(.dark)`. Admin uses `.light` class toggle.
- **Accessibility**: WCAG 2.2 AA contrast; visible focus styles; semantic landmarks.

## Admin vs Web differences

Admin palette is teal-accent (`#14b8a6`/`#0f766e`) and uses `--dsn-*` only (no brand aliases). Web palette is cyan-accent (`#22d3ee`/`#0891b2`) with brand layer (`--brand-primary #2f6bff`) and surface aliases (`--bg`, `--card`, `--stroke`, `--txt`, `--muted`). For backoffice shells, prefer the **web token set** (richer) unless targeting the standalone admin app, which uses admin tokens.
