r5 is a local-first music player prototype.

- pulls data from Radio4000 v1 (firebase) and v2 (r4)
- inserts it into your local in-browser (pg) database
- is built as a SvelteKit client-only web app

## architecture & data flow

```
+------------------+     +-------------------+     +------------------+
|   Local PGlite   | <-> |      r5 SDK       | <-> |  Remote Sources  |
|  (primary data)  |     |  (unified layer)  |     |   (r4/v1 sync)   |
+------------------+     +-------------------+     +------------------+
```

We read from the local database. We do optimistic updates, write to r4 and optionally `pull` data to refresh it.

1. App starts → loads from local database
2. As the user browses and plays it triggers sync → `.pull()` methods
3. User adds tracks → saves local first, persists to r4

## documentation

data/sync

- [local-database](local-database.md) - pglite setup, migrations, and query patterns
- [r5 sdk](r5-sdk.md) - unified api for local/remote data access
- [r5 cli](cli.md) - wraps the r5 sdk in a CLI and adds a `download` command
- [v1 data](v1-data.md) - how we deal with firebase v1 data
- [tanstack](tanstack.md) - reactive client store extending tanstack query

features

- [metadata](metadata.md) - track enrichment via youtube, musicbrainz, discogs etc
- [player](player.md) - audio playback engine and controls
- [search feature](search-feature.md) - full-text fuzzy search across channels and tracks
- [broadcast feature](broadcast-feature.md) - live streaming and auto-update behavior
- [followers](followers.md) - logic around following channels
- [keyboard](keyboard) - keyboard shortcuts
