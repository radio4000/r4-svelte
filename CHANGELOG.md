# Changelog

## January 2026

- Batch edit overhaul: faster, clearer UI, easy buttons for metadata and durations
- Broadcast stability improvements, rewritten with tanstack collections
- Unified alerts/warnings UI
- Added and improved channel and track forms, including dedicated edit/delete routes for tracks
- Infinite canvas replaces infinite grid for browsing channels
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
- Significantly improved startup loading performance for authenticated users (72% faster, from ~540ms to ~153ms to avatar visible)
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
