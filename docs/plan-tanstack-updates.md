# TanStack DB updates (January 2026)

Investigation into whether recent commits in the tanstakc ecosystem allow removing our workarounds. 

## Existing workarounds

### tracks.ts workarounds - STILL NEEDED

Tested removing the `writeUpsert` workaround in `updateTrack()`. Result: optimistic update shows immediately, then reverts ~20ms later to pre-edit state. Refresh shows the change persisted server-side.

**Root cause**: PR #1130 fixes `syncedData` staleness for the simpler `onInsert`/`onUpdate` callback pattern, but our offline executor flow (`createOfflineTransaction` → `tx.mutate()` → `tx.commit()`) doesn't update the query cache. The live query's `syncedData` still reads stale values from cache, overwriting the optimistic collection state.

The `writeUpsert` workaround updates both collection AND query cache, preventing the revert. All three workarounds remain necessary for offline transactions.

---

## Workarounds to review

### `src/lib/tanstack/collections/tracks.ts`

Three manual `writeUpsert`/`writeBatch` blocks exist specifically because "derived live queries don't react to transaction updates":

**Lines 182-184** in `updateTrack()`:

```typescript
// Derived live queries don't react to transaction updates, so manually trigger
const track = tracksCollection.get(id)
if (track) tracksCollection.utils.writeUpsert({...track, ...changes})
```

**Lines 218-224** in `batchUpdateTracksUniform()`:

```typescript
// Derived live queries don't react to transaction updates, so manually trigger
tracksCollection.utils.writeBatch(() => {
	for (const id of ids) {
		const track = tracksCollection.get(id)
		if (track) tracksCollection.utils.writeUpsert({...track, ...changes})
	}
})
```

**Lines 246-252** in `batchUpdateTracksIndividual()`:

```typescript
// Derived live queries don't react to transaction updates, so manually trigger
tracksCollection.utils.writeBatch(() => {
	for (const {id, changes} of updates) {
		const track = tracksCollection.get(id)
		if (track) tracksCollection.utils.writeUpsert({...track, ...changes})
	}
})
```

**Tested 2026-01-22**: Still needed. Offline transactions don't update query cache, so `syncedData` reverts optimistic updates.

## Affected files using collection.state directly

The codebase has 50+ places accessing `collection.state.values()` instead of relying on reactive data. Some may be necessary for immediate reads, but others might be workarounds:

- `src/lib/tanstack/collections/tracks.ts:37,59,304`
- `src/lib/tanstack/collections/broadcasts.js:79,89`
- `src/lib/tanstack/collections/follows.ts:70,77,91`
- `src/lib/tanstack/collections/play-history.ts:60,80`
- `src/lib/api.js:84,134,151`
- `src/lib/search.js:65`
- `src/lib/broadcast.js:23,38`
- `src/lib/lab/mix.ts:65,138,150,287,295,305`
- `src/lib/components/*.svelte` (various)
- `src/routes/**/*.svelte` (various)

## Conclusion

Updated to 1.0.19. Tested all workarounds on 2026-01-22:

| Workaround | Status | Reason |
|------------|--------|--------|
| `updateTrack()` writeUpsert | **Keep** | Offline tx doesn't update query cache |
| `batchUpdateTracksUniform()` writeBatch | **Keep** | Same pattern as above |
| `batchUpdateTracksIndividual()` writeBatch | **Keep** | Same pattern as above |

The PRs fix simpler patterns (`onInsert`/`onUpdate` callbacks), but our offline executor flow still needs the workarounds.

## Alternative patterns

### Option 1: Use `onUpdate` callbacks (no offline persistence)

```ts
const tracksCollection = createCollection({
    onUpdate: async ({transaction}) => {
        const {id, changes} = transaction.mutations[0]
        await sdk.tracks.updateTrack(id, changes)
        return {refetch: false}
    }
})

// Usage - no wrapper function needed
tracksCollection.update(id, draft => Object.assign(draft, changes))
```

PR #1130 fixed this pattern. Tradeoff: no offline outbox - mutation fails if offline.

### Option 2: Invalidate instead of writeUpsert

```ts
await tx.commit()
await queryClient.invalidateQueries({queryKey: ['tracks', slug]})
```

Cleaner but triggers a network refetch. Wasteful for updates where we already have the new value locally.

### Current choice: Keep writeUpsert workaround

Our workaround is ugly but correct for offline-first. We get:
- Persist to IndexedDB outbox first (durable even if tab closes)
- Immediate optimistic UI update
- Sync when online with retry/backoff
- Leader election across tabs

The real fix belongs upstream - `tx.commit()` should optionally update the query cache for optimistic consistency.

## Upstream issue

Consider opening an issue on [TanStack/db](https://github.com/TanStack/db/issues):

> **Offline transactions with query-db-collection: syncedData reverts optimistic updates**
>
> When using `createOfflineTransaction` with a collection created via `queryCollectionOptions`, optimistic updates revert after ~20ms because `tx.commit()` doesn't update the query cache. The live query's `syncedData` reads stale values from cache, overwriting the optimistic collection state.
>
> Current workaround: call `collection.utils.writeUpsert()` after `tx.commit()` to sync both collection and cache.
