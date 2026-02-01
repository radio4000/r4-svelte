# Track metadata system

We enrich our tracks with data from YouTube, MusicBrainz, and Discogs. It is stored in the "trackMeta tanstack db collection" with `{ytid, youtube_data, musicbrainz_data, discogs_data}`.

All metadata is only stored locally. It is not persisted to remote, except `track.duration` which is persisted.

## Data flow

```
track.url → ytid → pull() → trackMetaCollection
                              ↓
            insertDurationFromMeta() → track.duration (persisted)
```

The API layer keeps concerns separate: `pull` fetches metadata to local cache, `insertDurationFromMeta` copies duration to tracks. UI composes both when users expect automatic duration updates.

## Providers

- **YouTube**: `$lib/metadata/youtube.js` - duration, title, description
- **MusicBrainz**: `$lib/metadata/musicbrainz.js` - artist, release info
- **Discogs**: `$lib/metadata/discogs.js` - detailed release metadata

## Methods

- `pull(ytids)` - fetch from external API and save to trackMetaCollection
- `local(ytids)` - read from local track_meta only
- `search(title)` - search external API without saving
- `fetch(url)` - fetch external data without saving
- `hunt(trackId, ytid, title)` - discover Discogs URL via MusicBrainz chain
- `insertDurationFromMeta(channel, tracks)` - copy duration from trackMetaCollection to track.duration

## Components

- track-meta-r5.svelte
- track-meta-youtube.svelte
- track-meta-musicbrainz.svelte
- track-meta-discogs.svelte
