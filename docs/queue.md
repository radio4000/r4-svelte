# Queue

Sidebar panel showing upcoming tracks.

Queue state in `appState`: `playlist_tracks` (ordered IDs), `playlist_tracks_shuffled` (shuffled copy), `playlist_track` (current), `shuffle` (which list to use).

`api.next()` wraps at the end for normal playback, but stops after a playback error so an unplayable queue cannot loop forever.

Pure functions in `$lib/player/queue.ts` operate on `string[]` of track IDs: `queueNext`, `queuePrev`, `queueInsertManyAfter`, `queueRemove`, `queueShuffleKeepCurrent`, `queueRotate`, `queueUnique`.

The panel (`queue-panel.svelte`) resolves queued IDs against `tracksCollection` with Map lookups in playlist order — an `inArray` live query over a long queue blocks the main thread for seconds (see [tanstack](tanstack.md)). Searchable via fuzzysort. Left edge draggable to resize (200–800px, disabled on mobile).

Search, #tag and @mention filters live on the deck (`deck.queue_filter`, session-only) and decide what plays: next/prev stay within the matches (`deck.playlist_tracks_filtered`), starting from the current track. While filtering, one line shows the count (`12 / 40`), the chips and ✕ to clear. New queues, queue edits, playing a track outside the matches, and reload clear the filter.

Play history lives at `/history`, powered by [capture events](play-history.md).
