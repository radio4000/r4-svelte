# Changelog

## February 2026

- #Broadcast Auto radio — decks sync playback across listeners using universal time and track durations, with an "auto" badge on active decks
- #Channels Channels load on demand with server-side queries; server-side shuffle for the random view; new broadcasting filter
- #Auth Sign-up flow supports OTP code verification alongside magic links; fixed email/password auth errors
- #Player Volume stays at zero when advancing tracks instead of resetting
- #Queue Clearing a deck's queue also clears its active track
- #UI Fixed theme color picker applying incorrect values
- Removed Firebase — all v1 data migrated to PostgreSQL, so every Firebase code path could go
- #UI Added `g h` and `g d` keyboard shortcuts to jump to home and debug pages
- #Search Faster search page — channels and tracks now load in parallel instead of waiting for each other
- #UI New `<FancyButton>` component used across search and other pages
- #Player Fixed empty decks on page reload
- #Search views: a system (?) for filtering tracks by channel, tags, and full-text search on the client, fast, cached reactive. Should open up for some nice features.
- #Search changed its URL param from `?search=` to `?q=`, and now support @mentions and #hashtags as well as free text search across all channels and tracks
- #Mix supports up to 8 decks on /mix (was 2)
- #i18n Improved Portuguese translations; removed unused translation keys across all languages
- #UI Unified icon sizes to 20px across the app
- #Player Keyboard navigation for tracklists—use arrow keys to move and enter/space to play
- #Perf Optimized app state persistence by avoiding repeated JSON serialization of playlist tracks
- #Perf Improved grouped tracklist date rendering (up to 900ms faster in some cases)
- #UI Keyboard shortcuts dialog now opens with `?` key
- #Tracks Redesigned track context menu with clearer groupings
- #Channels can now search its tracks inline with tag filtering
- #Channels new page at `/[slug]/backup` to download channel data as JSON
- #Channels Display settings (list/grid view) now persist on followers/following pages
- #Tags Styled and translated the /tags page
- #Perf Faster track page loading
- #Perf Lazy-loaded Leaflet and GSAP to reduce initial bundle size
- #Perf Tooltips now share a single DOM element instead of one per tooltip
- #Perf Track freshness checks `updated_at` instead of fetching everything
- #Perf Converted remaining web components to native Svelte components
- #Player Multi-deck player with independent queues, playback speed, volume, and compact mode
- #Player SoundCloud and audio file playback in decks
- #Broadcast Multi-deck broadcasting — all deck state syncs to listeners via appState.decks
- #Channels RSS feeds at `/@slug.rss`
- #Channels Per-channel map page at `/@slug/map`
- #Channels Redesigned channel header and navigation layout
- #Tracks Track detail page with tabbed navigation and inline editing
- #Tracks Discogs link on track cards
- #Map OGL-based infinite canvas replaced Three.js
- #UI Icons on play/queue buttons across search and channel pages
- #UI App version number on load screen
- #UI Unified menu and navigation controls
- #Search Fixed /search not including v1 channels
- #Tracks Fixed missing Discogs metadata
- #Player Replaced internal media library with media-now
- #Channels Backup export now runs client-side

## January 2026

- #channels Followers and following pages now cached for faster navigation
- #i18n Translated more UI strings
- Add "Play" action in track context menu
- Live broadcast indicator on channel cards
- Add real R4 logo in header (goodbye test counter)
- Fixed tracklist index when tracks are grouped
- Share buttons for channels and tracks (via Web Share API or clipboard fallback)
- /mix now has dual decks
- Account management: change email, password, and manage login providers at /settings/account
- Fixed tracks not playing from /search results
- Unified form styling across the app
- Vertical header layout (moved to left side, flex + sticky positioning)
- Channel pages now have following/followers subroutes with nav and display modes
- Broadcast sync: listeners rejoin at the broadcaster's current position via seek-to-position
- Virtual tracklist in queue panel
- /mix now persists props and excludes channels without tracks
- Infinite canvas for browsing channels: mobile touch-to-play, active channel marker, hover names
- Fixed partial query support in search
- Fixed track edit modal
- Fixed fullscreen button active state
- Hide follow button for v1 channels (can't follow due to missing remote data)
- Performance: deferred tuner rendering, throttled appState persistence
- Renamed favorites → followings for consistency
- Batch edit overhaul: faster, clearer UI, easy buttons for metadata and durations
- Broadcast stability improvements, rewritten with tanstack collections
- Unified alerts/warnings UI
- Added and improved channel and track forms, including dedicated edit/delete routes for tracks
- Experimental /mix page
- Simplified and split map components
- Auth UI polish with social providers
- Replaced 11ty docs with Svelte
- Resolved all svelte-check warnings
- Prefer Svelte attachments over `use:` directives
- Layout options: default, constrained, focused
- Queue operations improvements
- More UI translations

## December 2025

- Queue panel is now resizable by dragging its left edge (desktop only)
- Fixed search not showing results on direct page load
- Batch editing UI with shift-click selection and tooltips
- Added `track.duration` + `track.playback_error` fields
- Replaced pglite with tanstack db
- Internet status indicator in header
- Fixed search fuzzy search and URL param reactivity bugs
- Improved spam tool UI
- Default channels filter now requires 10+ tracks
- Fixed track edit/delete inside modal
- Added logging system

## November 2025

- Multilanguage! Enjoy reading "play" in all the languages
- Faster startup for logged-in users
- Removed the CLI + browser terminal UI
- Changed /cli route to /repl

## October 2025

- SoundCloud tracks now play through a new media-chrome element
- Play history now shows newest entries first with relative timestamps
- Faster channel and track loading performance

## September 2025

- Added tags timeline page for channels at `/[slug]/tags` with year, quarter, and month filtering
- The CLI `r5 download` command now has retry logic and better errors
- Improved auth flow, channel page responsive
- Expanded theme customization with proper color scales and CSS variable controls
- Added "gs" keyboard shortcut for quick access to settings
- Fixed Safari browser compatibility issues affecting playback and navigation

## August 2025

- Added play/pause/next/prev commands to the /cli page
- The /stats page is neater and shows some new stuff
- Fixed more playback bugs
- Added a new, experimental (as always) 2d infinite grid for browsing channels
- Continuous playback (should) be more stable
- The documentation for the app is better, and can be deployed as a website if needed
- Nicer create account / sign in auth flow
- Custom tooltips on most icon buttons
- Fix /broadcasts page
- Tracks can pull in meta data from YouTube, MusicBrainz and Discogs.
- Pulled in an experimental CLI from another repo and made it work again
- Click @mentions and #hashtags inside track descriptions to find fun stuff faster
- Added a confirmation when you want to clear your listening history (since there's no undo)

## July 2025

Too many things to note.
