# Views

Views describe channel and track data. It is supposed to be a pattern we can reuse across URL params, filter and display UI, search and data loading. Views are private by design, sharable by nature.

We use views to power for example the /search. Here's a view:

```ts
type View = {
	channels?: string[]
	tags?: string[]
	tagsMode?: 'any' | 'all'
	order?: 'updated' | 'created' | 'name' | 'tracks' | 'shuffle'
	direction?: 'asc' | 'desc'
	limit?: number
	search?: string
}
```

We can go back and forth between a human readable query string, url params and a view:

```js
const view = parseSearchQueryToView('@ko002 #jazz hello')
// {channels: ['ko002'], tags: ['jazz'], search: 'hello'}

serializeView(view).toString()
// 'channels=ko002&tags=jazz&search=hello'

viewToQuery(view)
// '@ko002 #jazz hello'
```

- `@slug` → `channels` (e.g. `@oskar @ko002`)
- `#tag` → `tags` (e.g. `#jazz #dub`)
- Everything else → `search` (free-text FTS)

Tags always refer to track tags, not channel tags. When channels and tags combine, channels are fetched first, then tracks are post-filtered by tags client-side.

`processViewTracks(tracks, view)` applies this post-processing: tag filtering (respects `tagsMode`), fuzzy search on title/description, sort by order/direction, shuffle, and limit. `queryViewTracks` uses it internally, but it can also be used standalone for in-memory filtering.

## URL representations

The /search route supports both ?q (for nice usability) and view URL params.

## Saving and pinning

While a **View** is a stateless query recipe (`{channels, tags, order, ...}`), a **SavedView** gives it a name and persists it to localStorage: `{id, name, params, position?, description?, created_at}`. `params` is `serializeView(view).toString()`.

A SavedView with a non-null `position` appears in the sidebar. `pinView(id)` appends to the end, `unpinView(id)` clears the position, `reorderPinnedViews(orderedIds)` updates sort weights.

Clicking a pinned view navigates to `/@slug` for single-channel views, `/search?params` for everything else, for now.

## ViewsBar

Shared component on `/search` and `/_debug/views`. Props: `view`, `onchange(view)`. Active detection: `serializeView(view).toString() === sv.params`.

Three-state `mode`: **idle** (tabs + filter/display popovers), **adding** (clicked `+`, empty form to build a new view from scratch), **dirty** (changed filters after loading a saved view — shows a summary of active filters with "Save as" for a new view or "Update" to overwrite the base view).

## Files

- `src/lib/views.svelte.ts` — `View` type, parse/serialize helpers, `processViewTracks`, `queryViewTracks`
- `src/lib/tanstack/collections/views.ts` — `SavedView`, `viewsCollection`, CRUD + pin/unpin helpers
- `src/lib/components/views-bar.svelte` — `ViewsBar` component
- `src/lib/components/pins-nav.svelte` — renders pinned views in the sidebar
- `src/routes/_debug/views/+page.svelte` — debug playground
- `src/routes/settings/pins/+page.svelte` — pin management
