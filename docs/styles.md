# Styles

A tiny overview of how we style with CSS in the app.

The main @layout.svelte imports @styles/style.css, these are our global styles.
.svelte pages and components can additionally define scoped styles via `<style>`.

## Colors

`--gray-1` to `--gray-12`, `--accent-1` to `--accent-12`

Generated from four base colors in `variables.css` and `color-scales.css`.

## Typography

Font scale via `--font-1` (smallest) through `--font-9` (largest). Font families: `--sans-serif`, `--monospace`.

- `.caps` — uppercase monospace label text
- `<small>` — muted secondary text

## Buttons

Base styles apply to `<button>` and `<select>`. Use `.btn` on links.

- `.primary` — emphasized action
- `.danger` — destructive action (red)
- `.chip` — pill-shaped chip
- `.icon-btn` — borderless icon button
- `.active` — active/selected state

## Forms

- `form.form` — vertical flex layout with gap

## Layout

From `layout.css`:

- `.constrained` — 80ch centered
- `.focused` — vertically centered
- `.scroll` — scrollable container
- `.list` — dividers + hover
- `.grid` — responsive card grid
- `.row` / `.row--vcenter` — flex row
- `menu` / `menu[data-vertical]` / `menu[data-grouped]` — menus
- `dl.meta` — key-value pairs

Assume all elements have default styling we can rely on.
