# Instructions for this project

This file provides guidance to Claude and other LLM robots working with code in this repository.

Humans also welcome.

R5 is a prototype local-first music player for Radio4000. The name in dev is `r5`.
SvelteKit + Svelte 5, PGlite (client-side postgres), @radio4000/sdk

## Documentation

Read `docs/index.md` for more.
Continously update `./docs/` folder with learnings, more complex features

## File overview

```
/src/lib/types.ts      -- type definitions for the most important interfaces
/src/lib/r5/index.js   -- local/remote data synchronization
/src/lib/r5/db.js	   -- local pglite database
/src/lib/migrations/   -- sql migration files
/src/lib/api.js        -- reusable data operations
/src/lib/utils         -- the odd reusable function
/src/lib/dates         -- dates helpers
/src/lib/components    -- where components go
```

## Database and state

The app works with three sources:

1. Local PostgreSQL (client-side, PGlite) via `import {pg} from $lib/db` - primary interface, allows reads/writes
2. Remote PostgreSQL (radio4000/Supabase) - public reads, authenticated writes
3. Local json and remote API for v1 (firebase realtime db)

```sql
app_state    -- single row with id 1, all application state
channels     -- radio channels (id, name, slug, description, image)
tracks       -- music tracks (id, channel_id, url, title, description, ...)
```

Database is state. Most application state (UI state, user preferences, everything) lives in the local `app_state` table. Limited component state, avoid stores. The $lib/app-state.svelte automatically is a proxy and automatically persited to pglite via layout.svelte.

Read more in `docs/local-database.md` and `docs/r5-sdk.md`.

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

## HTML/CSS

- Don't redefine button styles etc., as we have global styles in `styles/style.css`
- Use CSS custom property variables from variables.css (colors, font-sizing)
- Right semantic elements (`<section>`, `<article>`, `<figure>`). No unnecessary container `<div>`s. Write HTML/CSS without classes by default. Use semantic elements, ARIA roles, data-\* attributes, and custom elements to express state/variants. Style via structure and modern selectors (:has, :where, :is), not class soup. Only introduce a class for 3rd-party hooks or proven reuse. Don't add arbitrary spacing or typography changes unless requested. Let browser defaults handle spacing, typography and most layout. Focus on styles critical for functionality. Reuse CSS custom property variables.

## Svelte 5 syntax

```js
let items = $state([])
let filtered = $derived(items.filter((item) => !item.hidden))
$effect(() => {
	items.push({hidden: false})
})
```

Use $derived liberally. $derived can be mutated!
`await` can be used inside components' `<script>`, `$derived()`and markup.
import`page`from`$app/state` (and not`$app/stores`)
Use `bind:this` to get a reference to the element. You can even export methods on it.
Snippets can be used for reusable "mini" components, when a file is too much https://svelte.dev/docs/svelte/snippet.
Attachments can be used for reusable behaviours/effects on elements https://svelte.dev/docs/svelte/@attach.

## Debug Tricks

You can't run queries on the local pglite database, because it is in the browser. You can ask me to run SQL queries on the local db for you with this snippet: (await window.r5.pg.sql`select * from tracks_with_meta limit 2`).rows

Format and lint the code using `bun run lint`. Or use the claude code command /lint-test.

When valuable, we can write tests using vitest. Put them next to the original file and name them xxx.test.js. Run tests with: `bun test [optional-name]`

The user can run the web app and perform sql queries on the local database to debug:

```js
;(await window.r5.pg.sql`select * from app_state where id = 1`).rows[0]
```

There is no need to start a dev server, as the user does it.

When searching for text or files, prefer using `rg` or `rg --files` respectively because `rg` is much faster than alternatives like `grep`.

## CLI

See @docs/cli.md. The project has a CLI tool for database operations, run it with: `bun src/lib/cli.ts --help`. It is very useful for you to verify data orchestration works. Can also be piped, used with jq etc. The CLI does not share db with the web app.

## Task-based agent approach

1. Operate on tasks with `plan.md` as your scratchpad
2. Research, ask user for guidance when things aren't clear, or strategically important
3. Review research, create a plan
4. Implement plan

- Prefer using the src/lib/r5 sdk for reading data @docs/r5-sdk.md

## @radio4000/components

These are the custom elements used on radio4000.com and many also in this app. See their full docs on http://localhost:4000/docs.html.
