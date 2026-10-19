Radio4000 is a music curation platform. People create radio channels and collect tracks — links to music on YouTube, Discogs, and other sources. You reference and annotate media. Human curation over algorithms, since 2014.

This repo (`github.com/radio4000/r4-svelte`) is the SvelteKit frontend. It uses Svelte, `@radio4000/sdk` (Supabase data layer), TanStack DB (local-first sync). The domain model: channels, tracks, views, decks, broadcast — is explained in [universe](docs/universe.md).

## Workflow

For any task or question:

1. Read docs first — scan `docs/reference.json` for relevant APIs or use `ast-grep outline` (aliased `sg`). Read any topic-specific doc inside `docs/`, and the nested AGENTS.md in the directory you're working in (styles, components, collections, player, routes/[slug]). Most answers are already there. Assess whether existing APIs cover the task or if new concepts are needed.
2. Ask clarifying questions before exploring the entire code base, or when the task is ambiguous

```
/src/routes           -- pages
/src/lib/types.ts     -- type definitions
/src/lib/api.ts       -- deck/player/UI orchestration (data layer is @radio4000/sdk + collections)
/src/lib/utils.ts     -- utility functions
/src/lib/collections  -- data and state
/src/lib/components   -- components
```

## Key docs

- [reference](docs/reference.json) - scan for relevant functions, SDK methods, components, types. Maintained by hand — update it when you add or change APIs (`ast-grep outline` helps list what's where)
- [universe](docs/universe.md) - domain model: channels, tracks, views, decks, broadcast, auto-radio
- [state](docs/state.md) - how data flows (remote, local sync, app state)
- [tone](docs/tone.md) - voice and tone for all copy (UI, docs, changelog)
- [code-style](docs/code-style.md) - code conventions, HTML/CSS, Svelte, global styles

Keep `docs/` brief — a few lines per topic, pointing at files. Deep detail (platform gotchas, workaround rationale) belongs in the module's header comment, next to the code it explains.

## Tips and debugging

Name CSS classes by primitive/identity (`tabs`, `btn`, `chip`, `link`, etc.), not by location (`explore-section-menu`) — reusable vocabulary styled once in `src/styles/`.
`window.r5` exposes `sdk`, `appState`, `queryClient`, `tracksCollection`, `channelsCollection` for console testing.
Playground routes live under `/src/routes/docs` alongside their markdown docs.
The `r4 --help` CLI can help inspect data from remote PostgreSQL.
Before testing anything, read [testing](docs/testing.md).
Verify with `bun run test` (one known failing test is expected), `bun run types`, `bun run check`.

## Working fast

An edit-and-check loop should take seconds, a proof about a minute. If you've waited longer, something is wrong: stop and look.

- Explore on dev: `portless r4 bun run dev`, open the page with `?perf` in agent-browser, edit, let HMR reload, read `window.r5.perf()`. No builds while exploring.
- Prove on a build, once per change: `bun run bench --ab <base> --only <steps up to yours>`. See [performance](docs/performance.md). Only an A/B shows a regression; old results from other runs don't. If other agents are editing the checkout, bench a commit with `--rev`.
- Run anything slower than a few seconds (bench, build, tests) in the background and wait for its completion notification. Never poll with sleep loops or `pgrep -f`, which matches your own shell and never ends.

Be concise. Short answers, no walls of text. No essays — a few sentences, then the decision or question. Start by restating the problem in 1-2 sentences so it's clear what you think we're solving. When asking the human something, make it a single clear question they can answer in one line.

GL HF
