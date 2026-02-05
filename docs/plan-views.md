# Views

Every list of tracks in the app is already a query. The idea: make that query a first-class thing you can name, save, share, and pipe into anything.

## The shape

A view is a recipe, not a snapshot.

```ts
type View = {
	channels?: string[] // channel slugs
	tags?: string[] // match tracks with these tags
	sort?: 'newest' | 'oldest'
	limit?: number
}
```

Empty view (`{}`) fetches nothing. At least one filter (channels or tags) required.

```
{channels: ['tropicalia']}                           → all tracks from one channel
{tags: ['ambient', 'dub']}                           → ambient dub across all loaded tracks
{channels: ['ko002', 'oskar'], tags: ['jazz']}       → jazz from two friends
{}                                                    → nothing
```

## URL encoding

Maps 1:1 to URL params:

```
?channels=tropicalia,ko002&tags=ambient,dub&sort=newest&limit=50
```

Copy the URL, send it to someone, they see the same thing. No auth needed.

## What this changes

Right now each surface builds its own track list independently. With views, they all speak the same language: one query shape flowing through the whole app.

## Layers

### 1. URL params (ephemeral)

The URL reflects the current view. Copy it, bookmark it, share it.

### 2. Saved views (persistent)

Logged-in users save a view with a name. Stored as name + JSON recipe. Gets a short ID: `?view=abc123`.

### 3. Views as inputs

A saved view can feed a /mix crate source, seed a new channel, etc.

## Composability

Merging two views = unioning their channels and tags. The URL stays flat. No nesting, no query language. Just arrays that grow.

## Non-goals (for now)

- Nested views (view-of-views)
- Exclude filters (NOT tag)
- Cross-user permissions — saved views are public by default
- Versioning — a view is mutable
- Snapshot export — views are alive

## Implementation — proof-of-concept

Core idea: URL params → `View` → `useLiveQuery` on `tracksCollection`. The live query handles fetching and reactivity. No imperative resolve step.

### How it works

1. `parseView(params: URLSearchParams): View` — reads URL params into a View
2. `serializeView(view: View): URLSearchParams` — inverse
3. The View drives a `useLiveQuery`:

```ts
const tracks = useLiveQuery((q) => {
	if (!view.channels?.length && !view.tags?.length) return undefined // nothing to query

	let query = q.from({tracks: tracksCollection})

	if (view.channels?.length)
		query = query.where(({tracks}) => inArray(tracks.slug, view.channels))

	if (view.tags?.length)
		query = query.fn.where((row) => view.tags.some((tag) => row.tracks.tags?.includes(tag)))

	if (view.sort === 'newest' || view.sort === 'oldest')
		query = query.orderBy(({tracks}) => tracks.created_at, view.sort === 'newest' ? 'desc' : 'asc')

	if (view.limit) query = query.limit(view.limit)

	return query
})
```

Search: skipped for POC. When added later, reuse the inline track search pattern from the `[slug]` page.

### `inArray` + `parseLoadSubsetOptions` (resolved)

`inArray` maps to the `in` operator in the expression AST. `parseLoadSubsetOptions` → `extractSimpleComparisons` handles it — produces `{ field: ['slug'], operator: 'in', value: ['oskar', 'maria'] }`.

But the current `tracksCollection` queryFn only matches `operator === 'eq'`, so it ignores `in` and returns `[]`.

**Fix:** update the queryFn to also handle `in`:

```ts
const slugEq = options.filters.find((f) => f.field[0] === 'slug' && f.operator === 'eq')?.value
const slugIn = options.filters.find((f) => f.field[0] === 'slug' && f.operator === 'in')?.value
const slugs = slugIn ?? (slugEq ? [slugEq] : [])
if (!slugs.length) return []
// fetch each slug, merge results
```

No automatic decomposition — the queryFn fetches each slug and merges.

### New files

**`src/lib/views.ts`** — `parseView`, `serializeView`, View type

**`src/routes/_debug/views/+page.svelte`** — debug page: parsed View as JSON, controls to edit params via `goto()`, reactive track list from `useLiveQuery`

### Modified files

- `src/lib/types.ts` — add `View` type
- `src/routes/_debug/+page.svelte` — nav link to views page

### Key reuse

- `tracksCollection` + `useLiveQuery` + `inArray` from `@tanstack/svelte-db`
- URL param read/write pattern from `src/routes/search/+page.svelte`

### Later

- Saved views (localStorage collection, same pattern as play-history)
- Search (reuse `[slug]` page inline search)
- Shuffle (presentation layer, not query)

## Prior art

- **Linear views** — saved filter/sort combos on issues
- **iTunes Smart Playlists** — rule-based, auto-updating playlists
- **Spotify Blend** — merges two users' tastes
- **Are.na channels** — composability ethos
