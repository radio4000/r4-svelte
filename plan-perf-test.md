# Performance: useLiveQuery Mount Overhead

## Problem

Navigating to channel pages with 1k+ tracks has noticeable lag (~400ms for 4k tracks). Root cause: `useLiveQuery` from `@tanstack/svelte-db` does O(n) work on every mount.

## Key Finding: SvelteMap is Wasted Work

The Svelte version of `useLiveQuery` eagerly builds TWO data structures on mount:

1. `state` - SvelteMap for key-based lookups
2. `data` - Array for iteration

**But this codebase only uses `.data`, never `.state` on query results.**

React version uses lazy getters (only builds when accessed). Svelte version builds both eagerly.

## Test Results

Tested with instrumented hook at `src/lib/tanstack-debug/useLiveQuery.svelte.js`.
Debug page: `/_debug/livequery-perf`

### Before (with SvelteMap)

| Items | createCollection | initState | syncData | **Total**  |
| ----- | ---------------- | --------- | -------- | ---------- |
| 2546  | ~14ms            | ~56ms     | ~63ms    | **~135ms** |
| 4000  | ~16ms            | ~182ms    | ~200ms   | **~400ms** |

### After (SvelteMap removed)

| Items | createCollection | initState | syncData | **Total**  | **Saved** |
| ----- | ---------------- | --------- | -------- | ---------- | --------- |
| 2546  | ~15ms            | REMOVED   | ~80ms    | **~98ms**  | 27%       |
| 4000  | ~15ms            | REMOVED   | ~192ms   | **~208ms** | **48%**   |

## Solutions Applied (in production)

1. **`isReady` check** - wait for `tracksQuery.isReady` before rendering (prevents double-paint)
2. **Render limit** - `.slice(0, 40)` with "Show all" button
3. **Freshness caching** - `checkTracksFreshness` wrapped with 60s staleTime

## Next Steps

1. **Open TanStack issue** - Svelte should use lazy getters like React
2. **Layout-level query** - keep query alive in `[slug]/+layout.svelte` to avoid remount
3. **Consider local fork** - use modified `useLiveQuery` without SvelteMap until upstream fixes

## Files

- `src/lib/tanstack-debug/useLiveQuery.svelte.js` - instrumented hook (SvelteMap removed)
- `src/routes/_debug/livequery-perf/` - test page
