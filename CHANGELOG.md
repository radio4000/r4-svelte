# Changelog

## September 2026

- #Channels there's a new /doctor page to help repair broken tracks in your radio

## August 2026

- #Player Browser agents can find channels, start playback, and control the active deck through WebMCP
- #UI Floating panels off keeps elevated header/deck backgrounds and section seams (header | main | decks), without a second border system

## July 2026

- #Channels Larger channel header with clearer navigation
- #Channels Tag filtering on the channel home and tracks page — shareable via `?tags=`, removable filter chips, prominent play/queue when active
- #Channels Track page title shows the track's name — or "Track" when it has none
- #Player Auto-radio button cycles in place: join, resync when drifted, leave when synced
- #Player Mobile Media Session play/pause, screen wake lock, and broadcast resync when returning to the tab
- #Deck Mobile decks are two-state — a compact bar, or tap to expand to fullscreen
- #Queue Track menu splits into play-next and add-to-queue; play-next also in search
- #Tracks Adding a track keeps your URL through the sign-in redirect
- #UI Buttons get press feedback and clearer active-state contrast; dialogs and popovers animate in and out, and the compact deck slides in like a sheet
- #Perf Faster tracklist rendering — content-visibility on rows and a single deck lookup (~15x layout)
- #Perf Smaller bundle — dropped unused dependencies and dead code

## June 2026

- #Deck Track progress bar with scrub and remaining time is on by default
- #Home Featured tracks rotate daily and include more channels
- #Explore Explore defaults to channels with more than 10 tracks
- #Map Channel map gets high-contrast markers, instant tile switching, and an auto-opening pin
- #Deck Shuffle button moved next to play
- #Channels Channel header tinted with the channel's avatar color
- #Theme Theme editor edits light and dark side by side; recomputed color scales and a `t` shortcut to toggle theme
- #UI Tightened spacing across components
- #Auth Fixed follows sync on sign-in and the login button label when a password is set
- #Perf Faster channel switching and less homepage layout shift

## May 2026

- Add N+P shortcuts for next/prev track (can be customized)
- #Perf It's now faster to change track
- #Perf Cut playback churn — deck persistence no longer writes transient runtime fields (media progress, drift flags) on every tick
- #Perf Homepage globe lazy-loads near viewport instead of importing on initial route

## April 2026

- #Economy `/about/economy` — interactive patronage dashboard backed by a pure math library for simulating the funding model
- #Routes `/explore` is now canonical for browsing; legacy `/channels/*`, `/tracks/*`, `/tags/*`, and `/feed` redirect there
- #Routes New `/broadcast` route for live listening, replacing the old auto-radio button
- #Header Draggable compact/extended nav — resize between icon-only, icon+label-below, and icon+label-right modes
- #Header Unified page headers behind a shared `PageHeader` component, sticky on focused pages
- #Mobile Bottom nav hides when a deck is open, restores when no deck is open
- #Matching Directional 100-point channel overlap score with transparent breakdown — shown next to the follow button with tracks/tags/follows-you context
- #Matching In-common overlap views and common-following previews on channel pages
- #Channels Tags dropdown on `/[slug]/tracks` replaced with a full modal filter dialog (tags, sort, result count)
- #Channels URL-shareable deterministic shuffle on track lists via `order=shuffle&seed=...`
- #Search Featured suggestion chips (channels + tags) randomize from the featured pool on each page load
- #Channels Load-more button at the bottom of paged grid/list views
- #Channels Dblclick or avatar-click on a live channel joins the broadcast
- #Map Distinct 3D-like broadcast markers for favorites; broadcasting channels visually distinct with a halo
- #Map Non-edit maps default to satellite tiles; channel map defaults to globe overview
- #Player Media Session API — lock-screen / notification metadata and next/prev controls for the active deck
- #Player Auto-radio disables progress seeking and tints the icon when synced
- #Player Remaining time shows in the final 10% of a track
- #Deck Video mix — stack multiple listening videos in a shared stage with a menu toggle
- #Deck Compact deck and broadcast listener controls unified; micro channel cards on compact slots
- #Deck Fullscreen button moved into the deck context menu
- #Broadcast Liveness auto-stop — stale broadcasts shut down on the client when idle
- #Broadcast Listener decks close cleanly when a live broadcast ends
- #Tracks Track context menu is now vertical with clearer groupings; artwork is a one-click play/pause with centered overlay
- #Tracks Track-card delete uses a modal dialog with a track preview
- #Tracks Track detail page has a sticky header with back-link and chip-tabs navigation
- #Tracks Channel micro-card renders on the right of track rows, outside the track card
- #Home Logged-out homepage: sticky map (50dvh), slideshow moved to `/about`, search moved from app menu into the homepage header
- #Home Logged-in homepage: refined tags row, onboarding moved to info-panel style
- #Home Per-deck current/next widgets removed; live-count link surfaces for signed-in users
- #Auth Password reset pages rewritten; forgot-password link added on login
- #UI Flat gray-3 button backgrounds, no shadow, no accent borders; forms use gray-1 inputs with no borders
- #UI Dialogs are mobile-responsive with keyboard-safe layout
- #UI Loader logo animates color while startup progress is visible
- #UI Clear visual hierarchy for normal/active/selected/playing tag states
- #Track-add "Add" button moved to dialog sticky footer; recently saved tracks shown as a track-card list
- #Track-add Discogs URLs route to the `discogs_url` field; metadata pane gets quick "play" and "add to channel" actions

## March 2026

- #Map New globe view — MapLibre replacing Leaflet — with day/night overlay, graticule lines, tile switching, and animated WebGL broadcast rings (OGL custom layer) on channels
- #Channels Standalone mode — import channels and tracks from local files (folder, M3U, backup, or URL) and browse them alongside the main database; build with `adapter-static` and `PUBLIC_APP_MODE`
- #Home New personalized homepage with stats, featured tracks, live broadcasting section, and Home/Feed filter tabs
- #Routes `/explore` restructured into `channels` / `tracks` / `tags` subroutes with tabs and URL-reflected filters
- #Routes New `/feed` route with date-range filtering
- #Routes New `/search/channels` and `/search/tracks` subroutes
- #Routes Removed `/mix` and `/broadcasts` — superseded by multi-deck + views and the homepage broadcasting section
- #Routes New `/embed` route and unified `EMBED_MODE` locking UI to deck interactions
- #Routes New `/apps` page with mobile / web app install guides
- #PWA Offline support via `@vite-pwa/sveltekit` — runtime page caching for SSR, 24h cache
- #Analytics Opt-in PostHog analytics
- #Tags New chain view — plain HTML tag selection with play/view actions, branch filtering, and URL-persisted chain state
- #Tags New cloud view, tag search, and grouped controls
- #Tags Clicking a tag inside a deck tracklist now filters inline
- #History Redesigned with play/queue buttons, track-card UI, day grouping, relative timestamps, and a separate `/history/stats` page
- #Views Pure view functions extracted to `views.ts` with tests; `queryViewTracks()` renamed to `queryView()`
- #Views View pagination
- #Queue Shuffle button now toggles on/off with active state; queue displays tracks in active queue order
- #Player Cover flip v2 — refined feel
- #Player Progress bar moved to the bottom across all deck modes, thinner and accent-colored
- #Tuner Spectrum scanner reworked to navigate by channel index
- #Tracks `/bookmarklet` page with drag-to-bookmark UX
- #Tracks Add-track dialog links its title to `/add` and lists recently added tracks
- #Channels Channel creation simplified — slug disclosure, no more logo step, updated copy
- #Settings Reorganized — grouped account actions, danger zone, back-link header, log-out button
- #Settings Account delete with email confirmation
- #Settings New `/settings/import` feature; shared `Dropzone` component across import pages
- #About Redesigned with interleaved images, channel row, and a back-link header
- #Welcome Copy rewritten and translated across 20 languages
- #Routing All hrefs use SvelteKit `resolve()` and base-aware APIs — fixes broken links under subpaths
- #SEO Shared `SEO` component across pages; service URLs (player, cloudinary, legal, chat) moved into app config
- #UI R5 version name removed from titles and webmanifest; app branding parameterized for i18n
- #UI Splash layout for vertically centered pages (auth, welcome)
- #i18n English UI copy extracted into messages; unused keys pruned; translations refreshed across all 20+ languages
- #Cache Query cache `maxAge` extended from 1h to 7d
- #Import Detect dead blob URLs and prompt to re-open folder; folder import supports `download.json` and plain audio folders

## February 2026

## February 2026

- #Broadcast Listener presence — live counts per channel, per deck, and app-wide, with opt-in sharing in settings
- #Channels 3D canvas reflects live playback, broadcast, and favorite state on cards; `/@slug/image` shows an interactive 3D scene per channel
- #Channels Link previews via OpenGraph meta tags on channel and track pages
- #i18n Full localization pass — all remaining hardcoded strings extracted, locale applied before first render
- #Broadcast Auto radio detects playback drift and resyncs listeners automatically
- #Tracks Centralized track identity by provider and media ID, per-tab metadata fetching, and tighter Discogs integration with URL validation and deduplicated suggestions
- #Search Views use a URI-based system with pure functions and tests; `queryView()` replaces `queryViewTracks()`
- #Channels Tabbed tag/channel navigation on channel pages and a new `/@slug/mentions` route
- #UI Neutral surface tokens for overlays, higher contrast, animated deck transitions
- #Auth `/welcome` page for users who haven't created a channel yet
- #Player Play history moved from deck panel into main navigation
- #Search Saved views — bookmark any search as a named view and pin favorites for quick access from the header
- #Channels Channel homepage shows the latest track, description, and a tags/mentions overview
- #Channels Channel cards display @mentions and #hashtags from descriptions
- #Channels Fixed channel image upload
- #Tracks Track metadata tabs (Discogs, MusicBrainz, YouTube, related) are now separate routes with their own URLs
- #Tracks Denser Discogs release pages with direct "add track" from any release row
- #Tracks Improved MusicBrainz matching accuracy
- #Tracks Add-track dialog autofocuses the URL field
- #Player Deck 1 starts compact by default; refined button placement and track-locate in queue
- #Broadcast Improved reactivity and fixed stale deck state when listeners disconnect
- #UI Refreshed tags styling
- #UI App loader shows the release date of the current build
- #UI Dialogs no longer close when dragging inside them
- #UI Fixed theme CSS variables falling out of sync
- #Perf Inlined loading spinner for faster first paint
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
