Hello robot, be concise. Short answers, no walls of details. No essays — a few sentences. GL HF

---

Radio4000 is a music curation platform. People create radio channels and collect tracks — links to music on YouTube, Discogs, and other sources. You reference and annotate media. Human curation over algorithms, since 2014.

This repo (`github.com/radio4000/r4-svelte`) is the SvelteKit frontend. It uses `@radio4000/sdk` (Supabase data layer), TanStack DB (local-first sync). The domain model: channels, tracks, views, decks, broadcast — is explained in [universe](docs/universe.md).

## Start here

Find what exists before adding anything: `ast-grep outline <paths>` lists symbols per file (descriptions are the JSDoc above each), `rg` finds usages. Read the `docs/` topic and nested AGENTS.md only for the area you touch (styles, components, collections, player, routes/[slug]).

Anchors in `src/lib/`: `app-state.svelte.ts` (global state, persisted), `api.ts` (deck/player/UI orchestration), `collections/` (data, on top of `@radio4000/sdk`), `types.ts`.

## Key docs

- [universe](docs/universe.md) - domain model: channels, tracks, views, decks, broadcast, auto-radio
- [state](docs/state.md) - how data flows (remote, local sync, app state)
- [tone](docs/tone.md) - voice and tone for all copy (UI, docs, changelog)
- [code-style](docs/code-style.md) - code conventions, HTML/CSS, Svelte, global styles

Keep `docs/` brief — a few lines per topic, pointing at files. API descriptions are JSDoc on the symbol (fields of `AppState`/`Deck` in `types.ts`, exports in their modules). Deep detail (platform gotchas, workaround rationale) belongs in the module's header comment, next to the code it explains.

## Tips and debugging

`window.r5` exposes the sdk, appState, collections and perf/deck probes for console testing (see `src/routes/+layout.js`).
Playground routes live under `/src/routes/docs` alongside their markdown docs.
The `r4 --help` CLI can help inspect data from remote PostgreSQL.
Before testing anything, read [testing](docs/testing.md).
Verify with `bun run test`, `bun run types`, `bun run check`.
