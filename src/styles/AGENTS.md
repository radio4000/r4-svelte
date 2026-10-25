# Global styles

The `@import` order in style.css is the cascade order — later files win.

variables.css holds the base tokens. color-scales.css derives the -1..12 scales from `--gray-light`/`--gray-dark` and `--accent-light`/`--accent-dark` — edit those base pairs, not the generated scales. theme-0.css is intentionally unused, kept for inspiration.

The `--media-*` custom properties are consumed by the external media-chrome library, so grep shows no usage beyond their definition — they're not dead.

Deck/player chrome (compact bar, strip) lives in player.css, folded in from the former deck.css — check here before adding breakpoint rules inside deck-*.svelte. Breakpoints are consolidated to 520px, 640px, and 1024px.

Every `:hover` rule goes inside `@media (hover: hover) and (pointer: fine)`, or a tap on a phone leaves it stuck on. Rules on `:not(:hover)` describe the resting state and stay outside. Use `:focus-visible`, not `:focus`, for button highlights, for the same reason.
