# Code style

## Writing style

For voice and tone across all copy (UI, docs, changelog), see [tone.md](tone.md).

Lead with the point. Skip preambles, start mid-thought when context is clear.

Assume domain knowledge. Say "use debouncing" not "you might want to consider implementing a debouncing mechanism." Reference concepts directly without basic explanations.

Natural prose over formatting tricks. Never do "**bold**: explanation" syntax. Prefer flowing paragraphs to numbered lists when the content permits. Sentence case for titles.

Terse and precise. Expand reasoning only when asked. Point out flaws directly: "that breaks because..." not "one consideration might be..."

Dry wit welcome. Channel the sensibility of someone who finds elegance in plain text and thinks most abstractions are premature.

## Code conventions

- Direct property access over getters/setters when direct access works
- Minimal abstraction - keep code paths direct without unnecessary layers
- Self-documenting code via clear naming; comments only explain WHY when not obvious
- Named exports over default exports
- JSDoc for types, don't obsess over TypeScript
- Pass primitives directly, avoid wrapper objects around simple data
- Use literal objects directly, avoid helper functions for basic object creation
- Methods should do something meaningful beyond simple delegation
- Domain-specific verbs that match user mental models
- Pure functions for composability in api/utils/data operations
- Optimistic execution - trust methods, let errors throw
- No type casts to silence errors - they hide real issues
- No i18n until features are finalized

## HTML/CSS

Global styles live in `styles/style.css` - don't redefine button styles etc.

Use CSS custom properties from `variables.css` for colors and font-sizing.

Semantic elements (`<section>`, `<article>`, `<figure>`) over container `<div>`s. Write HTML/CSS without classes by default. Express state via semantic elements, ARIA roles, `data-*` attributes. Style via structure and modern selectors (`:has`, `:where`, `:is`), not class soup. Only introduce a class for 3rd-party hooks or proven reuse.

Let browser defaults handle spacing, typography, and most layout. Focus on styles critical for functionality.

## Svelte 5

Use `$derived` liberally - values can be reassigned and object properties mutated.

`await` works inside `<script>`, `$derived()`, and markup.

[Snippets](https://svelte.dev/docs/svelte/snippet) for reusable mini-components when a file is too much.

[Attachments](https://svelte.dev/docs/svelte/@attach) for reusable behaviors/effects on elements.
