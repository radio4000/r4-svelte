# Styles

Preferences for styling with HTML and CSS in the app.

The main layout.svelte imports our global `styles/style.css`. 
Components and .svelte pages can optionally define scoped styles via `<style>`. Scoped styles often do not need arbitrary classes for styling, rely on the semantic HTML structure if possible. 
Assume all elements have default styling we can rely on.

## Layout

From `layout.css`:
- `.constrained` — 80ch centered
- `.focused` — vertically centered
- `.scroll` — scrollable container
- `.list` — dividers + hover
- `.grid` — responsive card grid
- `.row` / `.row--vcenter` — flex row
- `.tabs` — tab row (links or buttons) with underline active
- `menu` / `menu.nav-vertical` / `menu.nav-grouped` — menus
- `dl.meta` — key-value pairs

## Colors

`--gray-1` to `--gray-12`, `--accent-1` to `--accent-12`

Generated from four base colors in `variables.css` and `color-scales.css`.

## Typography

Font scale via `--font-1` (smallest) through `--font-9` (largest). Font families: `--sans-serif`, `--monospace`.

- `.caps` — uppercase monospace label text
- `<small>` — muted secondary text

## Forms

- `form.form` — vertical flex layout with gap. Structure: `form > fieldset > label + input`. Group with `fieldset > legend + fieldset`. Use `fieldset.row` for horizontal layout.

## Buttons

Base styles apply to `<button>` and `<select>`. Use `.btn` on links.

- `.primary` — emphasized action
- `.danger` — destructive action (red)
- `.chip` — pill-shaped chip
- `.icon-btn` — borderless icon button
- `.active` — active/selected state

