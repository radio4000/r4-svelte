# R5

Web frontend for Radio4000. SvelteKit + Svelte 5.

## Workflow

1. Choose something from @plan.md to work on
2. Instead of exploring the codebase, start by looking inside the @./docs folder, it is very likely to have what you need
3. Write a plan
4. Implement
5. Review your work
6. Update @plan.md (remove completed items)
7. Update @docs if needed
8. bun run check && bun run types

```
/src/routes           -- pages
/src/lib/types.ts     -- type definitions
/src/lib/api.js       -- data operations
/src/lib/utils.ts     -- utility functions
/src/lib/tanstack     -- data and state
/src/lib/components   -- components
```

## Key docs

- [data-state](docs/data-state.md) - how data flows (remote, local sync, app state)
- [code-style](docs/code-style.md) - writing style, code conventions, HTML/CSS, Svelte
- [styles](docs/styles.md) - rely on global styles, don't add CSS unless needed
- [tanstack](docs/tanstack.md) - TanStack DB deep-dive
- [browser-testing](docs/browser-testing.md) - testing with agent-browser

## Debug

Format and lint: `bun run check`

`window.r5` exposes sdk, appState, queryClient, tracksCollection, channelsCollection for console testing.

Use `/src/routes/_debug` for (temporary) test routes and playgrounds.

the `r4 --help` CLI can help inspect data from remote PostgreSQL

## Style notes

- Be concise. Short answers, no walls of text.
