# R5

Web frontend for Radio4000. SvelteKit + Svelte 5, @radio4000/sdk, TanStack DB.

Channels (`/@slug`) are collections of tracks. Tracks (`/@slug/tracks/:id`) are links to music (YouTube, SoundCloud, embeddable URLs).

Data flows from the remote database ([radio4000-sdk](radio4000-sdk.md)) through the local sync layer ([tanstack](tanstack.md)). Some channels come from a [legacy Firebase import](v1-data.md).

[player](player.md) handles playback, [queue](queue.md) manages upcoming tracks and history, [search](search-feature.md) finds channels and tracks, [broadcast](broadcast-feature.md) syncs listening in real-time, [followers](followers.md) lets you follow channels, [play-history](play-history.md) tracks what you've listened to, [metadata](metadata.md) enriches tracks via MusicBrainz and YouTube, [keyboard](keyboard.md) shortcuts, [localization](localization-i18n.md), [styles](styles.md) for theming.

[overview](overview.json) lists exported functions, [browser-testing](browser-testing.md) for testing. [/mix](/mix) combines sources into playlists, [/settings](/settings) for appearance and account. Data caches locally for offline use. Auth via email or OAuth.

[data-state](data-state.md) covers the data architecture, [code-style](code-style.md) has conventions for writing code here.
