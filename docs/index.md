r5 is a local-first music player prototype.

- pulls data from Radio4000 v1 (firebase) and v2 (r4 postgres)
- queries and caches it in your browser storage
- is built as a SvelteKit client-only web app

+------------------+ +-------------------+ +------------------+

| (primary data) | | (unified layer) | | (r4/v1 sync) |
+------------------+ +-------------------+ +------------------+

```

We query from the local collections. Tanstack fires requests as needed to read and write data. We have optimistic updates, offline transactions and caching.

## Overview

- [tanstack](tanstack.md) - unified api for local/remote data access
- [v1 data](v1-data.md) - how we deal with firebase v1 data
- [metadata](metadata.md) - track enrichment via youtube, musicbrainz, discogs etc
- [player](player.md) - audio playback engine and controls
- [play-history](play-history.md) - track play history and statistics
- [search feature](search-feature.md) - full-text fuzzy search across channels and tracks
- [broadcast feature](broadcast-feature.md) - live streaming and auto-update behavior
- [followers](followers.md) - logic around following channels
- [keyboard](keyboard.md) - keyboard shortcuts
- [localization](localization.md) - internationalization and multi-language support
- [styles](styles.md) - css architecture and design system
```
