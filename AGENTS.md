# Instructions for this project

This file provides guidance to Claude and other LLM robots working with code in this repository.

Humans also welcome.

R5 is a prototype local-first music player for Radio4000. The name in dev is `r5`.
SvelteKit + Svelte 5, @radio4000/sdk and Tanstack DB

Currently we're in a branch refactoring AWAY from pglite and trying to use tanstack db instead. See docs/tanstack/.

## Documentation

Read `docs/index.md` for more.
Continously update `./docs/` folder with learnings, more complex features

## File overview

```
/src/lib/types.ts      -- type definitions for the most important interfaces
/src/lib/api.js        -- reusable data operations
/src/lib/utils         -- the odd reusable function
/src/routes/tanstack/collections         -- all our data collections
/src/lib/dates         -- dates helpers
/src/lib/components    -- where components go
```

## Database and state

The app works with three sources:

1. Our local "tanstack collections"
2. Our locally exported v1 firebase json export (channels_v1.json)
3. Remote PostgreSQL (radio4000/Supabase) - public reads, authenticated writes

```sql
appState    -- single row with id 1, all application state
channels     -- radio channels (id, name, slug, description, image)
tracks       -- music tracks (id, channel_id, url, title, description, ...)
```

Database is state. Most application state (UI state, user preferences, everything) lives in the local `appState` module. Limited component state, avoid stores. App state is a local collection and stored in local storage.

Read more in `docs/local-database.md`

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
import `page`from`$app/state` (and not`$app/stores`)
Use `bind:this` to get a reference to the element. You can even export methods on it.
Snippets can be used for reusable "mini" components, when a file is too much https://svelte.dev/docs/svelte/snippet.
Attachments can be used for reusable behaviours/effects on elements https://svelte.dev/docs/svelte/@attach.

## Debug Tricks

You can't run queries on the in-browse storage. BUT, you can ask me to run them for you:: `channels = [...window.r5.channelsCollections.state.values()]; channels.map(...`
Format and lint the code using `bun run lint`. Or use the claude code command /lint-test.
When valuable, we can write tests using vitest. Put them next to the original file and name them xxx.test.js. Run tests with: `bun test [optional-name]`
There is no need to start a dev server, as the user does it.
When searching for text or files, prefer using `rg` or `rg --files` respectively because `rg` is much faster than alternatives like `grep`.

## CLI

You can use the `r4` cli (separate project) to inspect data, pipe with jq etc. Explore the help commands as needed.

## Task-based agent approach

1. Operate on tasks with `plan.md` as your scratchpad
2. Research, ask user for guidance when things aren't clear, or strategically important
3. Review research, create a plan
4. Implement plan

## @radio4000/components

These are the custom elements used on radio4000.com and many also in this app.

- When you fetch tanstack documentation, suffix the url with .md to get raw markdown
- LIMIT and OFFSET queries with tanstack require an ORDER BY clause to ensure deterministic results
- when you fetch tanstack suffix urls with .md to get raw markdown
