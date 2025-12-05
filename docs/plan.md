# PLAN

List of possible improvements to the architecture, idea, cli and web application.
Verify and evaluate todos before taking them on. They might be outdated or just not good ideas.

## Agent Continuation: Reduce svelte-check errors

**Status:** Reduced from 247 to 168 errors (32% reduction)

**Run:** `bun run check` to see current errors

**What was fixed:**

- `src/lib/utils.ts` - Array type annotations for parseEntities, extractHashtags, extractMentions
- `src/lib/api/player.js` - JSDoc types for PlayEndReason, PlayStartReason, MediaPlayer
- `src/lib/api/fetch-channels.ts` - Proper Channel type returns (using `as Channel` cast)
- `src/lib/types.ts` - Added `| null` to optional fields to match SDK/Supabase types
- `src/lib/api.js` - Date arithmetic `.getTime()`, null→undefined fixes
- `src/lib/dates.js` - Date arithmetic `.getTime()` fixes
- `src/routes/tanstack/collections/channels.ts` - Moved user_id to transaction metadata
- Various `.svelte` and `.js` files - Date arithmetic, type annotations

**Remaining high-value fixes:**

1. **SDK return types** (`@radio4000/sdk`): `createChannel` returns union with `PostgrestResponseSuccess<unknown>` which loses typed data. Needs SDK fix to remove `unknown` from union.
2. **Svelte 5 attachment types** (17 errors): `{@attach}` directive adds symbols to props that HTMLProps doesn't expect. May need Svelte type updates.
3. **map.svelte** (19 errors): Leaflet integration with possibly-null checks
4. **spectrum-scanner.svelte** (12 errors): Canvas/animation type issues
5. **broadcast.js** (9 errors): SDK type issues, null handling
6. **vertical-loop.js** (7 errors): GSAP `getProperty` returns `string | number`

**Files with most errors:**

- `src/lib/components/map.svelte` (19)
- `src/lib/components/spectrum-scanner.svelte` (12)
- `src/lib/broadcast.js` (9)
- `src/routes/[slug]/batch-edit/+page.svelte` (8)
- `src/lib/components/tool-tip.svelte` (8)

**Approach for remaining fixes:**

- For SDK types: Fix in `@radio4000/sdk` package
- For Svelte attachments: Consider `// @ts-expect-error` or wait for Svelte type updates
- For possibly-null: Add optional chaining or guards
- For GSAP: Cast to number with `Number()` or type assertions

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
