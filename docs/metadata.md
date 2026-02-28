# Track metadata system

We enrich our tracks with data from YouTube, MusicBrainz, and Discogs. It is stored in the "trackMeta tanstack db collection" with `{provider, media_id, youtube_data, musicbrainz_data, discogs_data}`.

All metadata is only stored locally. It is not persisted to remote, except `track.duration` which is persisted.

## Data flow

```
track.url → provider + media_id → pull() → trackMetaCollection
                                           ↓
                         updateTrack() → track.duration (persisted)
```

Track detail metadata is fetched on demand per tab (`youtube`, `musicbrainz`, `discogs`) instead of globally on track page load.

## Providers

- **YouTube**: `$lib/metadata/youtube.js` - duration, title, description
- **MusicBrainz**: `$lib/metadata/musicbrainz.js` - artist, release info
- **Discogs**: `$lib/metadata/discogs.js` - detailed release metadata

## Methods

- `pull(mediaIds)` - fetch from external API and save to trackMetaCollection
- `local(mediaIds)` - read from local track_meta only
- `search(title)` - search external API without saving
- `fetch(url)` - fetch external data without saving
- `hunt(trackId, mediaId, title)` - discover Discogs URL via MusicBrainz chain
- `pullYouTubeSingle(mediaId)` - fetch YouTube metadata on demand
- `pullMusicBrainz(provider, mediaId, title)` - fetch MusicBrainz metadata on demand
- `pullDiscogs(provider, mediaId, discogsUrl)` - fetch Discogs metadata on demand

## Components

- track-meta-r5.svelte
- track-meta-youtube.svelte
- track-meta-musicbrainz.svelte
- track-meta-discogs.svelte

Track cards show a Discogs link when Discogs metadata is available.
