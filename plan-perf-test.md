# Performance Investigation: Channel Tracks Page

## Problem

Navigating to a channel page with 2546 tracks had ~900ms delay. Even smaller channels (313 tracks) showed noticeable lag.

## Root Cause

`useLiveQuery` from `@tanstack/svelte-db` has O(n) overhead on every mount because it:

1. Creates a derived collection via `createLiveQueryCollection()`
2. Iterates the entire source collection
3. Applies filters and sorting
4. Returns new array references

With 2546 tracks, this adds ~400-900ms per navigation.

## Solutions Applied

### 1. `isReady` Check (Major Win)

**Problem:** Browser was painting tracks twice - once with unsorted data, then again sorted.

**Fix:** Wait for `tracksQuery.isReady` before rendering:

```svelte
{#if tracksQuery.isReady && tracks.length > 0}
	<Tracklist {tracks} />
{/if}
```

**Result:** Single paint, no flash of wrong order, significant perf improvement.

### 2. Render Limit with Slice

**Problem:** Rendering 2500+ DOM elements is slow regardless of data source.

**Fix:** Load all data but render limited:

```js
const tracksQuery = useLiveQuery(
	(q) =>
		q
			.from({tracks: tracksCollection})
			.where(({tracks}) => eq(tracks.slug, slug))
			.orderBy(({tracks}) => tracks.created_at, 'desc')
	// No .limit() - load all for search/filter
)

let allTracks = $derived(tracksQuery.data || [])
let tracks = $derived(renderLimit ? allTracks.slice(0, renderLimit) : allTracks)
```

**Result:** Fast initial render of 40 tracks, full data available for search.

### 3. "Show All" Button

Users can opt into rendering full list when needed.

### 4. Session-Persistent Render Limit

```js
// Module-level SvelteMap persists during session
const channelLimits = new SvelteMap()
let renderLimit = $derived(channelLimits.get(slug) ?? 40)
```

### 5. Freshness Check Caching

**Problem:** `checkTracksFreshness(slug)` queried Supabase on every navigation.

**Fix:** Wrapped in `queryClient.fetchQuery` with 60s `staleTime`:

```ts
queryClient.fetchQuery({
	queryKey: ['tracks-freshness', slug],
	staleTime: 60_000,
	queryFn: async () => {
		/* check logic */
	}
})
```

## What Didn't Help

### Component Complexity

Tested `track-card-lite.svelte` (bare minimum `<li>{title}</li>`) - still slow with 2500 items.
**Conclusion:** Component complexity is secondary to useLiveQuery overhead.

### Virtualization Alone

With `virtual={true}`: Still ~700-900ms delay.
**Conclusion:** Virtualization helps render performance but doesn't help if delay is before render.

### Direct Collection Read

Bypassing useLiveQuery with direct read was instant:

```js
let tracks = $derived(
	[...tracksCollection.state.values()]
		.filter((t) => t.slug === slug)
		.sort((a, b) => b.created_at.localeCompare(a.created_at))
)
```

But `tracksCollection.state` is not Svelte-reactive (plain Map), so this loses reactivity to mutations.

## Final Architecture

```
useLiveQuery (no limit)
    ↓
allTracks (full dataset, sorted)
    ↓
.slice(0, renderLimit)
    ↓
Render 40 tracks + "Show all" button
```

- **Data:** Fully loaded, available for search/filter
- **Render:** Limited by default, expandable on demand
- **Reactivity:** Maintained via useLiveQuery
- **Performance:** Fast initial render, acceptable load time

## Files Modified

- `src/routes/[slug]/+page.svelte` - render limit, isReady check, show all button
- `src/lib/tanstack/collections/tracks.ts` - freshness check caching
- `src/lib/components/tracklist.svelte` - restored to use TrackCard

## Potential Future Improvements

- Report to TanStack DB team - `createLiveQueryCollection` could cache by query key
- Layout-level query - keep query alive during [slug]/\* navigation to avoid re-mount overhead
- Indexed queries - if TanStack DB adds index support for faster filtering
