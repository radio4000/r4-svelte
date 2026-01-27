# R5

Web frontend for Radio4000. SvelteKit + Svelte 5.

## Workflow

1. Choose something from @plan.md to work on
2. Read @docs/index.md, there might a be a document related to the task
3. Write a plan
4. Implement
5. bun run check && bun run types
6. Review your work
7. Update @plan.md
8. Update @docs if needed

```
/src/routes           -- contains our pages
/src/lib/types.ts     -- type definitions for the most important interfaces
/src/lib/api.js       -- reusable data operations
/src/lib/utils.ts     -- reusable utility functions
/src/lib/tanstack     -- data and state
/src/lib/components   -- all components
```

## Database and state

The remote PostgreSQL (via Supabase) database is our source of truth and where data is persisted.
Use the `@radio4000/sdk` (or sdk.supabase directly), or the `r4 --help` CLI to interact with it.
Most data is also synced to local storage or IDB, either manually or with tanstack db.
The `appState` is a svelte, reactive global and local-persisted object we use for player, queue, user settings etc.

## Debug Tricks

When valuable, we can write tests using vitest.
There is no need to start a dev server, the user will do it.
Format and lint the code using `bun run check`.
Use @docs/browser-testing.md for testing in browser

We use `window.r5` to expose sdk, appState, queryClient, tracksCollection, channelsCollection. Example: `[...window.r5.channelsCollection.state.values()].map(...` for testing.

Use the @src/routes/\_debug folder to create test routes and playgrounds.

## Writing style (guides, docs, explanations)

Lead with the point. Skip preambles, start mid-thought when context is clear.

Assume domain knowledge. Say "use debouncing" not "you might want to consider implementing a debouncing mechanism." Reference concepts directly without basic explanations.

Natural prose over formatting tricks. Never do "**bold**: explanation" syntax. Prefer flowing paragraphs to numbered lists when the content permits. Sentence case for titles.

Terse and precise. Expand reasoning only when asked. Point out flaws directly: "that breaks because..." not "one consideration might be..."

Dry wit welcome. Channel the sensibility of someone who finds elegance in plain text and thinks most abstractions are premature.

## Code Style

- Direct property access: Avoid getters/setters when direct property access works
- Minimal abstraction: Keep code paths direct and clear without unnecessary layers
- Focus on next actions, not recaps
- Self-documenting code: Use clear naming that makes comments unnecessary
- Zero non-essential comments: Do not comment on what the code does - only explain WHY when not obvious
- Exports: Prefer named exports over default exports
- Types: Prefer jsdoc, don't obsess over typescript
- Pass primitives directly, avoid wrapper objects around simple data
- Use literal objects directly, avoid helper functions for basic object creation
- Meaningful methods: Methods should do something meaningful beyond simple delegation
- Use domain-specific verbs that match user mental models
- Pure functions for composability in api/utils/data operations
- Optimistic execution - trust in methods, let errors throw
- Avoid type casts to silence errors. Casts like `/** @type {any} */` or `as Type` are bloat that hide real issues.
- Don't worry about i18n until we've finalized a feature

### HTML/CSS

- Don't redefine button styles etc., as we have global styles in `styles/style.css`
- Use CSS custom property variables from variables.css (colors, font-sizing)
- Right semantic elements (`<section>`, `<article>`, `<figure>`). No unnecessary container `<div>`s. Write HTML/CSS without classes by default. Use semantic elements, ARIA roles, data-\* attributes, and custom elements to express state/variants. Style via structure and modern selectors (:has, :where, :is), not class soup. Only introduce a class for 3rd-party hooks or proven reuse. Don't add arbitrary spacing or typography changes unless requested. Let browser defaults handle spacing, typography and most layout. Focus on styles critical for functionality. Reuse CSS custom property variables.

### Svelte 5 tips

Use $derived liberally. $derived can be mutated.
`await` can be used inside components' `<script>`, `$derived()`and markup.
Snippets can be used for reusable "mini" components, when a file is too much https://svelte.dev/docs/svelte/snippet.
Attachments can be used for reusable behaviours/effects on elements https://svelte.dev/docs/svelte/@attach.
