# r4:// URI scheme

A compact, human-readable string encoding one or more channel/tag/search queries merged into a single queue — a **composite view**.

```
r4://@alice #jazz;@bob #techno,house;@coco miles davis?order=created&dir=desc&limit=100
```

Extends the existing human query syntax (`@slug #tag freetext`). A URI with no `;` segments is identical to the current `View` query.

---

## Syntax

```
r4://<segment>[;<segment>...][?<options>]
```

### Segments (separated by `;`)

Each segment is an independent mini-query, fetched in parallel and merged.

| Token         | Meaning              | Example       |
| ------------- | -------------------- | ------------- |
| `@slug`       | Tracks from channel  | `@ko002`      |
| `#tag`        | Filter tracks by tag | `#jazz`       |
| anything else | Full-text search     | `miles davis` |

Multiple `@` in a segment (`@ko002 @oskar`) means "from either channel", same as the current multi-channel `View`.

### Options (after `?`, global to all segments)

| Key        | Values                                  | Default   | Meaning                                          |
| ---------- | --------------------------------------- | --------- | ------------------------------------------------ |
| `order`    | `created`, `updated`, `name`, `shuffle` | `created` | Sort applied to merged result                    |
| `dir`      | `asc`, `desc`                           | `desc`    | Sort direction                                   |
| `limit`    | 1–4000                                  | none      | Max tracks after merge                           |
| `tagsMode` | `any`, `all`                            | `any`     | Tag match for segments without explicit override |
| `exclude`  | comma-separated track UUIDs             | none      | Skip these track IDs                             |

---

## Examples

```
r4://@ko002
r4://@ko002 #jazz
r4://@ko002 #jazz miles davis?order=created&dir=asc&limit=50
r4://#jazz #dub?tagsMode=all
r4://?order=shuffle&limit=50

r4://@alice #jazz;@bob #techno,house;@coco miles davis
r4://@alice;@bob;@coco?order=shuffle&limit=100
r4://@ko002?exclude=uuid-1,uuid-2,uuid-3
r4://@ko002 #jazz;@oskar #dub?exclude=uuid-1,uuid-2
```

---

## Data types

### Existing `View` (unchanged)

```ts
type View = {
	channels?: string[]
	tags?: string[]
	tagsMode?: 'any' | 'all'
	order?: 'updated' | 'created' | 'name' | 'shuffle'
	direction?: 'asc' | 'desc'
	limit?: number
	search?: string
}
```

### New: `ViewSegment`

```ts
type ViewSegment = {
	channels?: string[]
	tags?: string[]
	tagsMode?: 'any' | 'all'
	search?: string
}
```

The query part of a `View` — what to fetch. Sort/limit/direction are display options and stay global. `tagsMode` lives here because each segment may combine tags differently; the global `?tagsMode` option sets the default for segments that don't specify one.

### New: `CompositeView`

```ts
type CompositeView = {
	segments: ViewSegment[] // 1..n
	order?: View['order']
	direction?: View['direction']
	limit?: number
	exclude?: string[] // track IDs to skip
}
```

A `CompositeView` with one segment and no `exclude` is equivalent to the current `View`.

---

## API

### `parseUri(uri: string): CompositeView`

```ts
parseUri('r4://@alice #jazz;@bob #techno?order=shuffle&limit=100&exclude=uuid-1')
// {
//   segments: [
//     { channels: ['alice'], tags: ['jazz'] },
//     { channels: ['bob'],   tags: ['techno'] }
//   ],
//   order: 'shuffle',
//   limit: 100,
//   exclude: ['uuid-1']
// }
```

Steps:

1. Strip `r4://` prefix
2. Split on first `?` → `queryPart`, `optionsPart`
3. Split `queryPart` on `;` → segment strings
4. Each segment: `parseSearchQueryToView(segment)` → `ViewSegment`
5. Parse `optionsPart` with `URLSearchParams` → global options

### `serializeUri(cv: CompositeView): string`

```ts
serializeUri({segments: [{channels: ['alice'], tags: ['jazz']}, {channels: ['bob']}], order: 'shuffle'})
// 'r4://@alice #jazz;@bob?order=shuffle'
```

Steps:

1. Each segment → `viewToQuery(segment)`
2. Join with `;`
3. Append `?key=value` for order/dir/limit/tagsMode/exclude

### `resolveUri(uri, {tracksCollection, sdk}): Promise<Track[]>`

```ts
async function resolveUri(uri, {tracksCollection, sdk}) {
	const cv = parseUri(uri)
	const segmentResults = await Promise.all(cv.segments.map((seg) => queryViewTracks(() => seg).tracks))
	let tracks = segmentResults.flat()
	if (cv.exclude?.length) {
		const excluded = new Set(cv.exclude)
		tracks = tracks.filter((t) => !excluded.has(t.id))
	}
	return processViewTracks(tracks, {order: cv.order, direction: cv.direction, limit: cv.limit})
}
```

---

## Relation to existing patterns

### `SavedView.params` → `SavedView.query`

`SavedView` currently stores `params: string` (URLSearchParams format). Phase 1 adds a `query` field storing the compact URI body (without `r4://`): `"@alice #jazz;@bob?order=shuffle"`.

Migration: if `query` is absent, fall back to parsing `params`.

### Auto-radio seed

`viewKey(view)` currently produces the shuffle seed. With URIs: `serializeUri(cv)` — same determinism, human-readable, works for multi-segment views.

### Broadcast payload

Phase 3 — send URI instead of `playlist_tracks`:

```json
{"uri": "r4://@alice #jazz;@bob?order=shuffle", "track_id": "...", "position": 23.5}
```

For ad-hoc queues with no URI: `{ "uri": null, "playlist_tracks": [...], "track_id": "..." }`

---

## What the URI cannot represent

| Scenario                           | Alternative                                 |
| ---------------------------------- | ------------------------------------------- |
| Manually reordered queue           | Store `playlist_tracks: string[]` alongside |
| "Start from this track"            | Use `track_id` as separate field            |
| Time-based window ("last 30 days") | Could add `since=30d` option later          |

---

## Implementation phases

**Phase 1 — URI for pins**

- Add `parseUri`, `serializeUri` to `src/lib/views.svelte.ts`
- Single-segment support + `exclude`
- Add `SavedView.query` field (compact URI body without `r4://`); keep `params` for migration fallback
- Update `views-bar`, `pins-nav`, `settings/pins` to use `query`

**Phase 2 — Composite views**

- Add `CompositeView` type + `resolveUri`
- Update `queryViewTracks` to accept `CompositeView`
- Update auto-radio seed to use `serializeUri`

**Phase 3 — Broadcast compression**

- Send URI in broadcast payload; listeners resolve locally

**Phase 4 — Presence / social**

- Broadcast current URI via Supabase presence for "now listening" discovery

---

## Files

- `src/lib/views.svelte.ts` — add `parseUri`, `serializeUri`, `CompositeView`, `ViewSegment`
- `src/lib/collections/views.ts` — add `query` field to `SavedView`
- `src/lib/components/views-bar.svelte` — use `query` when saving/loading
- `src/lib/components/pins-nav.svelte` — use `query` to build navigation links
- `src/routes/settings/pins/+page.svelte` — display/edit URI
