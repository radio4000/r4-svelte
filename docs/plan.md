# PLAN

List of possible improvements to the architecture, idea, cli and web application.
Verify and evaluate todos before taking them on. They might be outdated or just not good ideas.

## Agent Continuation: Reduce svelte-check errors

**Status:** Reduced from 98 to 16 errors (84% reduction this session)

**Run:** `bun run check` to see current errors

**Remaining errors are:**

1. **useLiveQueryPatched.svelte.ts** (8 errors) - Tanstack DB API changed
2. **channels.ts** (3 errors) - SDK `createChannel` returns `{}`, needs SDK fix
3. **offline-executor.ts** (1 error) - `onTransactionComplete` removed from Tanstack API
4. **channels.svelte** (1 error) - Circular type reference in derived
5. **following/+page.svelte** (1 error) - ChannelCard prop type mismatch

**Plus 11 warnings:** Empty CSS rulesets, state_referenced_locally

**Remaining require upstream/SDK fixes or architectural decisions.**

---

### Error 1: useLiveQueryPatched.svelte.ts

Tanstack DB API changed between versions. The patched hook was written for an older API.

| Line          | Error                                                               |
| ------------- | ------------------------------------------------------------------- |
| 11            | `LiveQueryCollection` not exported (now `LiveQueryCollectionUtils`) |
| 27, 28, 45-47 | `Type 'T' does not satisfy constraint 'object'`                     |
| 36            | `Type 'unknown' is not assignable`                                  |
| 66            | `createLiveQueryCollection` signature changed                       |

**Fix options:**

1. Update generics to `T extends object` and fix imports to match current Tanstack API
2. Pin to older Tanstack version (not recommended)
3. Remove patch if upstream fixed the `state_unsafe_mutation` issue — check if still needed

---

### Error 3: offline-executor.ts

`onTransactionComplete` callback was removed from Tanstack's `OfflineConfig` type.

```ts
_executor = startOfflineExecutor({
  onTransactionComplete: (tx) => offlineLog.info('complete', ...),  // ← doesn't exist
```

**Fix options:**

1. Check Tanstack offline-transactions docs for replacement callback (maybe renamed?)
2. Remove the logging callback if no equivalent exists
3. Use a different hook point if available (e.g., wrap mutationFns)

## Type Handling Rules

**Never use type casts to silence errors.** Casts like `/** @type {any} */` or `as Type` are bloat that hide real issues.

Instead:

1. **Fix the function signature** to accept what callers actually pass. If a function only uses `{id, slug}`, don't require a full `Channel` type.
2. **Fix the type definition** to match reality. If SDK returns `created_at: string | null`, update the interface.
3. **Add guards inside functions** to handle edge cases. Return early if a required field is missing.
4. **Pass explicit values** when narrowing doesn't work: `{id: track.id, slug: track.slug}` instead of passing the whole object.

Type errors often reveal actual bugs or design issues. Casting them away loses that signal.

# BACKLOG

- **Refine offline error handling:** In `syncTracks` and `syncChannels`, use `NonRetriableError` from `@tanstack/offline-transactions` for server-side validation errors (e.g., HTTP 4xx) to prevent unnecessary retries.

## TanStack DB experiment (branch #tanstackdb)

Core tracks/channels collections working. See `docs/tanstack/tanstack.md` for architecture.

### Migration: Remove PGlite dependency

**Remaining:**

- [x] `src/routes/[slug]/batch-edit/` — **Rebuilt with TanStack**. Direct mutations via `updateTrack()`. No staging layer.

References:

- https://github.com/TanStack/db/issues/921 (our bug report: loadAndReplayTransactions called twice)
- https://tanstack.com/db/latest/docs/overview

## Other alternatives to explore

- explore replacing pglite with automerge v3
- consider https://turso.tech/blog/introducing-turso-in-the-browser to replace pgsql (tough performance at times)

## Bug: IDB persistence overwrites fresh data after mutations

**Problem:** When updating a track field (e.g., `playback_error`), the update succeeds on remote Supabase, but the UI reverts to stale data.

**Root cause:** Race condition between IDB cache restore and query invalidation. After a mutation:

1. `updateTrack()` updates local collection optimistically
2. SDK PATCH to Supabase succeeds
3. `invalidateQueries()` triggers refetch
4. IDB persister restores stale cached data, overwriting the fresh response

**Reproduction:**

1. Have IDB cache with track data (normal usage)
2. Trigger `updateTrack()` with a new field value (e.g., `playback_error` from player error)
3. Watch the field flash correct value then revert to `null`
4. `indexedDB.deleteDatabase('keyval-store')` + reload fixes it temporarily

**Confirmed working:**

- SDK `updateTrack()` works (tests pass)
- RLS policies allow the update (direct SQL works)
- Remote data is correct after update
- Without IDB persistence, everything works

**Files involved:**

- `src/routes/tanstack/persistence.ts` - IDB persister setup
- `src/routes/tanstack/collections/tracks.ts:150-154` - invalidation after mutation

**Possible fixes:**

1. Exclude tracks from persistence (`shouldDehydrateQuery` filter by queryKey)
2. Fix the race: ensure restore completes before mutations can invalidate
3. Use mutation timestamps to detect stale restores
4. Invalidate IDB cache entry when mutation succeeds

## General backlog

- add an url param to directly queueplay a track. maybe slug?play=trackid
- implement password reset flow (supabase auth)
- share buttons/embeds (evaluate if needed)
- local file player for mp3/m4a uploads
- add validation layer at sync boundaries (remote->local) using lib like zod 4
- allow users to mark a musicbrainz or discogs meta track data as wrong. Since we auto-match on the track title, there's a relatively high chance it's wrong. If it's wrong, users can delete the meta data for that track. But then it'd just match it again on reload. How do we deal with this, do we spend effort on this?
- run `bun run check` and slowly get rid of these warnings - tidy codebase
- What should happen when you play a track that is not part of the current loaded playlist? Replace playlist (with what?)? Just play, ignore playlist?
- analyze https://svelte.dev/docs/svelte/$effect#When-not-to-use-$effect - keep up with Svelte 5 patterns
- group metadata enrichment functions (youtube, musicbrainz) under single namespace "metadata" instead of "sync" - better organization
- consider integrating "bandsintown" as a third-party API similar to musicbrainz, youtube meta - rich data connections
- V1 compatibility: v1 channels can't be followed/broadcasted because remote supabase doesn't know about their foreign keys. V1 channels have firebase_id but don't exist in remote postgres, causing FK constraint failures. Solution ideas: use string-based IDs instead of proper foreign keys, or create placeholder records in remote for v1 channels.
- rethink the methods and naming in lib/api vs lib/player/api
- enhance logger: expose store.logs in devtools ui
- create standardized loading/error boundaries for async operations in ui
- find a way to share `track_meta` data between users. push it remote, how? security?
- improve broadcast feature
