# R5

Web frontend for Radio4000. SvelteKit + Svelte 5.

## Workflow

For any task or question:

1. **Read docs first** — `docs/reference.json` (full API reference). Read any topic-specific doc inside the ./docs folder. Most answers are already there. Assess whether existing APIs cover the task or if new concepts are needed.
2. **Ask clarifying questions!** before exploring the entire code base, and when the task is ambiguous
3. Run `bun run check && bun run types` once when you think you're done — not after every edit. These are slow and noisy; running them repeatedly wastes time and clutters the output.
4. Update @plan.md and docs where needed — delete done items from plan, don't strikethrough

```
/src/routes           -- pages
/src/lib/types.ts     -- type definitions
/src/lib/api.ts       -- data operations
/src/lib/utils.ts     -- utility functions
/src/lib/tanstack     -- data and state
/src/lib/components   -- components
```

## Key docs

- [reference](docs/reference.json) - **read this first** — all exported functions, SDK methods, components, types
- [state](docs/state.md) - how data flows (remote, local sync, app state)
- [tone](docs/tone.md) - voice and tone for all copy (UI, docs, changelog)
- [code-style](docs/code-style.md) - code conventions, HTML/CSS, Svelte
- [styles](docs/styles.md) - rely on global styles, don't add CSS unless needed
- [tanstack](docs/tanstack.md) - TanStack DB deep-dive
- [browser-testing](docs/browser-testing.md) - testing with agent-browser
- See `docs/` for topic-specific docs (player, search, broadcast, etc.)

## Running scripts

Run `bun run test`, `bun run check`, `bun run types` **directly** — never pipe through `tail`, `head`, or `grep`. Bun/Vitest use terminal control sequences that break when piped, causing empty output or hanging commands.

## Debug

`window.r5` exposes sdk, appState, queryClient, tracksCollection, channelsCollection for console testing.
Use `/src/routes/_debug` freely for (temporary) test routes and playgrounds.
The `r4 --help` CLI can help inspect data from remote PostgreSQL
Be concise. Short answers, no walls of text.

Please read ./docs folder for any relevant topics.
