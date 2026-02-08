# R5

Web frontend for Radio4000. SvelteKit + Svelte 5.

## Workflow

For any task or question:

1. **Read docs first** — `docs/overview.json` (full API reference), then any topic-specific doc. Most answers are already there. Use the docs to assess whether existing APIs cover the task or if new concepts are needed.
2. **Ask clarifying questions** if the task is ambiguous — before exploring or planning.
3. Once done review your work with `bun run check && bun run types`
4. Update @plan.md and @docs if needed.

Broad file searches and `node_modules` reads are fine, but ideally not as a first step.

```
/src/routes           -- pages
/src/lib/types.ts     -- type definitions
/src/lib/api.js       -- data operations
/src/lib/utils.ts     -- utility functions
/src/lib/tanstack     -- data and state
/src/lib/components   -- components
```

## Key docs

- [overview](docs/overview.json) - **read this first** — all exported functions, SDK methods, components, types
- [state](docs/state.md) - how data flows (remote, local sync, app state)
- [code-style](docs/code-style.md) - writing style, code conventions, HTML/CSS, Svelte
- [styles](docs/styles.md) - rely on global styles, don't add CSS unless needed
- [tanstack](docs/tanstack.md) - TanStack DB deep-dive
- [browser-testing](docs/browser-testing.md) - testing with agent-browser
- See `docs/` for topic-specific docs (player, queue, search, broadcast, mix, metadata, etc.)

## Debug

`window.r5` exposes sdk, appState, queryClient, tracksCollection, channelsCollection for console testing.
Use `/src/routes/_debug` freely for (temporary) test routes and playgrounds.
The `r4 --help` CLI can help inspect data from remote PostgreSQL

Be concise. Short answers, no walls of text.
