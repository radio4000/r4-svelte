# R5

Web frontend for Radio4000. SvelteKit + Svelte 5.

## Workflow

1. Choose something from @plan.md to work on
2. Read @docs/index.md, there might be a document related to the task
3. Write a plan
4. Implement
5. bun run check && bun run types
6. Review your work
7. Update @plan.md
8. Update @docs if needed

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
- [tanstack](docs/tanstack.md) - TanStack DB deep-dive
- [browser-testing](docs/browser-testing.md) - testing with agent-browser

## Debug

Format and lint: `bun run check`

`window.r5` exposes sdk, appState, queryClient, tracksCollection, channelsCollection for console testing.

`/src/routes/_debug` for test routes and playgrounds.

the `r4 --help` CLI can help inspect data from remote PostgreSQL
