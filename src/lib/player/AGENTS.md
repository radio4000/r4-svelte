# Player internals

player.svelte (in ../components) is the per-deck playback UI — one instance per deck, keyed by deckId which never changes across its lifetime (hence the `untrack()` around `createDeckDisplay`). Architecture in docs/player.md and docs/decks.md; auto-radio in docs/auto-radio.md; queue math in docs/queue.md.

deck-display.svelte.ts is the single source for what a deck shows right now. Don't re-derive its fallback chains ad hoc.

media-session, stall-recovery and audio-keepalive are platform workarounds, not player logic. Each file's header explains the bug it works around; read it before touching them.

Player code that needs a whole channel calls `loadChannelTracks(slug)` (channel-tracks.ts) and uses the rows it returns. It shares the channel page's cache key and keeps the rows resident for a few seconds so the deck's keepalive pin can take over; don't fetch around the collection or `writeUpsert` a channel by hand.
