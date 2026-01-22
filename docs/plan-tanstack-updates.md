# TanStack DB workarounds

Tested 2026-01-22 on v1.0.19. Three `writeUpsert`/`writeBatch` workarounds in `src/lib/tanstack/collections/tracks.ts` are still needed.

## Problem

Offline transactions (`createOfflineTransaction` → `tx.mutate()` → `tx.commit()`) don't update the query cache. The live query's `syncedData` reads stale values, reverting optimistic updates ~20ms after they appear.

PR #1130 fixed the simpler `onUpdate` callback pattern, but not our offline executor flow.

## Workarounds

Search for "Derived live queries don't react" in `tracks.ts`. Three places call `writeUpsert` after commit to sync both collection AND query cache:

- `updateTrack()`
- `batchUpdateTracksUniform()`
- `batchUpdateTracksIndividual()`

## Upstream fix

The real fix: `tx.commit()` should optionally update the query cache. Issue template:

> **Offline transactions: syncedData reverts optimistic updates**
>
> `createOfflineTransaction` + `queryCollectionOptions` collection: optimistic updates revert because `tx.commit()` doesn't update query cache. Workaround: `collection.utils.writeUpsert()` after commit.
