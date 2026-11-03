# Collections

TanStack DB collections. Big picture in docs/state.md; contracts (writeUpsert, mutation handlers, live queries, pagination) in docs/tanstack.md — this file is only the local gotchas those don't cover.

Three kinds live here: server-backed via `queryCollectionOptions` (channels, tracks, follows, tags — channels.ts/tracks.ts are the canonical examples), local-only via `createLocalCollection` (capture-events, spam-decisions, track-meta, views), and one subscription-only realtime collection, broadcasts.ts (no mutation handlers; drives `deck.broadcasting_channel_id` as a side effect).

Gotchas:

- Every queryFn and handler branches on `capabilities.globalBrowse` / `capabilities.mutations` (`#lib/modes.js`) — embed/standalone mode vs the full app. Easy to break.
- `writeUpsert` accepts a single item or an array. `writeBatch` is only needed to mix operation types (insert + delete) in one atomic batch.
- A live-query `orderBy` on a column the rows don't have (`shuffle`) ties, and insertion order wins, so rows loaded earlier for another reason (the user's follows) crowd the list, and only for signed-in users. Rank the rows yourself (`rankShuffled`) and filter on the rank with `gte`, since `isNull` doesn't match missing fields.
