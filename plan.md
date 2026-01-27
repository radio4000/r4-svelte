# PLAN

List of possible improvements to the architecture, idea and web application.

Verify and evaluate todos before taking them on. They might be outdated or just not good ideas. Do not blindly implement!

## BACKLOG

### Broadcast & Live

- improved broadcast icons on active channels → when a channel is broadcasting, show a "live" icon on the channel card and on the channel's homepage. We have this "live dot" to reuse maybe
  - ? How many users actively use broadcast? Is this high priority?

- move broadcast view to a channels list filter → instead of having /broadcast, we could have "broadcast" as a filter on the channels list (like "with artworks" or "v1/v2" or "1000+ tracks
  - ? What's wrong with /broadcast as a route? Discoverability, or something else?

- Brainstorm "auto live" to complement broadcast feature. Autolive (name TBD) would reduce the track.durations for a channel. This would allow people to tune in to a radio and listen to the same track without the owner broadcasting anything
  - ? Is this a real user request or speculative? Needs server-side time tracking — significant complexity.
  - ? Keep, park, or remove?

### Multi-deck / Mix

- second/third player to have mix between tracks and a few decks to make transitions; possibility to show not just one player, but several (with tracklist queue, and controls) so a user can play with multiple tracks like a dj deck (old mix.radio4000.com, and libli.org also had this feature) → for example "cue track in deck B" or "play track in deck C". Also see /mix route for inspiration
  - ? Target user: DJs preparing sets, or casual listeners wanting crossfades?
  - ? How much effort vs. improving core single-player?

- /mix input UX: adding channels/tags requires type → enter → click chip. Consider debounced autocomplete with keyboard selection like /search does. Or unified input with @channel #tag syntax (already have parseMentionQuery in search.js).
  - ? Is /mix actively used? What's its current state?

- /mix tag discovery: surface (possibly shared) tags from selected source channels as suggestions.

### Channel & Track UX

- improved channel filters/search for tags, mention, search etc. maybe inside the channel view → when clicking on a channel's tags, it should filter the tracks of this channel, by the selected tag(s)/mention(s), directly on the channel (not a global search). Can it work with useLiveQuery where on track.tags for instance?
  - ? Is this for discovery ("show me jazz tracks") or management ("edit all tracks tagged X")?

- improved fullscreen? if player does not have a track, fullscreen layout looks weirdly empty; if player has a track, maybe fullscreen should be a real full screen (questions of the display mode for the play: docker, mini, full etc.).
  - ? Is this causing user complaints, or just a polish item?

- Share track modal?
  - ? Same as "share buttons/embeds" below, or different?

- repost current track: shift+c shortcut (c opens modal) or subtle button after track title/desc in player. Keep it discoverable but not too prominent.
  - ? How common is reposting? Worth the UI real estate?

- /channels infinite mode: only uses 16 loaded channels by default. Temporarily lift limit to hundreds while infinite mode is active.

- what should happen when you play a track that is not part of the current loaded playlist? Replace playlist (with what?)? Just play, ignore playlist?
  - ? What's the current behavior? Is this causing confusion?

- Seek/position support: add `seekTo(seconds)`, `getPosition()` via media-chrome player. Support `?t=` URL param like YouTube for deep-linking into tracks.
  - ? Just for incoming links, or also generate shareable timestamped links?

### Authentication & Account

**Current work (auth-improvements branch):**
- Sign up only offers magic link, login has password option. Add password signup?
- Hardcoded English strings need i18n: "Connect", "Change email", "Delete account", "Save password", "Never mind, go back"
- Unify form markup across auth pages (some use `<fieldset>`, some plain `<label>`)
- Welcome message for new accounts (first login? onboarding flow?)
- Optimize /settings/account UI — cleaner provider management, better visual hierarchy

**Existing functionality (working):**
- Reset password: `/auth/reset-password` → email → `/auth/reset-password/confirm`
- Change email: `/settings/account/email`
- Change password: `/settings/account/password`
- OAuth provider management: `/settings/account` (connect/disconnect Google, Facebook)

### Settings & Appearance

- Simplify design and UI on /settings/appearance to what's relevant to the end user
  - ? What's currently in there that shouldn't be?

- Alternate map view as a 3D globe view
  - ? What problem does this solve that the current map doesn't?
  - ? Keep, park, or remove?

### Data & Migration

- Migrate v1 data to v2 https://github.com/radio4000/migration-2026
  - ? Is migration-2026 repo active? What's blocking it?
  - ? How many v1 channels exist?

- v1 compatibility: v1 channels can't be followed/broadcasted because remote supabase doesn't know about their foreign keys. V1 channels have firebase_id but don't exist in remote postgres, causing FK constraint failures. Addressed by migration-2026 task above.
  - ? Once migration completes, is this resolved? Or do you need indefinite backward compat?

### Performance & Technical

- The subroutes on /@slug keep fetching data remotely when it could be cached
  - ? Is this noticeably slow, or just wasteful?

- We compute track.ytid via regex from track.url all the time. Consider setting track.ytid via a database trigger when track.url is updated
  - ? This appears twice (here + Performance section). Quick win — prioritize?

- As the track/channel.description fields can contain links, we want to turn the strings into HTML and parse links. This is pretty heavy when you're rendering tons of items. How to avoid? Another DB trigger that stored descrtipion_parsed or similar?
  - ? How heavy is "heavy"? Have you profiled this?

- Freshness check shows `local: null` on every page load, causing unnecessary re-fetches. Likely related to disabled `collection-persistence.ts`. When re-enabling IDB persistence, ensure local timestamps are stored/retrieved.
  - ? Is this causing visible slowness or just extra network?

- Sometimes on /search when you double-click to play a track, it won't play but log "track not loaded" (which obv isn't true since it was there to click)
  - ? Reproducible? This sounds like a bug to fix, not a backlog item.

- Our appState is serialized into localstorage on every edit to persist it. But since appState.playlist_tracks (and the shuffled) versions potentially include 3k items, it might get slow. More than this, it's just unecessary to serialize all on every change. It is however easy to reason about in the app. One appState, done. How could we improve the perf here? First thought is to split it into appState + playerState for example, if we can that way split the tracklist arrays that are only updated on channel/queue changes anyway.
  - ? Have you measured serialization time? How large does playlist_tracks get?

- On-demand predicate push-down: we set `syncMode: 'on-demand'` but don't use `parseLoadSubsetOptions` in queryFn. Currently we manually check for slug and call different SDK methods. With proper on-demand, live query `where()` clauses flow through to backend:

  ```ts
  const {where} = parseLoadSubsetOptions(ctx.meta.loadSubsetOptions)
  const filters = extractSimpleComparisons(where)
  const slugFilter = filters.find((f) => f.field[0] === 'slug')
  if (slugFilter) return fetchTracksBySlug(slugFilter.value)
  ```

  Benefit: add date range or search filters in UI, they flow to SDK without touching queryFn dispatch.
  - ? Is this blocking features, or just a cleaner architecture?

- add validation layer at sync boundaries (remote->local) using lib like zod 4 shared types from sdk?
  - ? Have you had data integrity bugs, or is this preventive?

- create standardized loading/error boundaries for async operations in ui
  - ? Is the current error handling inconsistent? What's broken?

### Sharing & Social

- share buttons/embeds (evaluate if needed)
  - ? Is this the same as "Share track modal" above?
  - ? What's the actual use case — embed on external sites?

- batch-edit: URL-persist filter/search/sort state so filtered views survive refresh and can be bookmarked
  - ? Is batch-edit actively used? Typical workflow?

### Research / Speculative

- look into atproto as backend alternative to supabase. sign in with bluesky, your channel + tracks are now synced into. one way sync? probably for now unforunately. See github.com/radio4000/r4atproto
  - ? Serious consideration or "someday maybe"? This is a major architectural shift.
  - ? Keep in backlog or move to a separate "research" doc?

## Parked features

- direct IDB collection persistence: bypasses TanStack Query cache to avoid "cache restore overwrites optimistic updates" issue. Disabled due to performance problems. See `collection-persistence.ts` (commented out) and `docs/plan-tanstack-collection-idb-idea.md` for design.
  - ? What were the performance problems specifically? Worth revisiting?

## Performance

### track-card bottlenecks (3k+ tracks)

- ? Do you have profiling data, or are these suspected bottlenecks?
- ? What's the typical user — power users with 3k tracks, or mostly casual with <100?

- extractYouTubeId per card: regex parsing runs for each track. Consider caching results or moving to track sync time. We really should set this whenever URL is updated server-side.
  - ? Duplicate of backlog item. Consolidate and prioritize as quick win?

- LinkEntities per description: parses/transforms text for each track description. Could batch or cache.

- PopoverMenu per card: 3k popover instances in DOM even if not visible. Lazy-render only when opened? Maybe fine as is, since its native
  - ? Have you tested this? If native popovers are fine, remove from list.

- active state: `appState.playlist_track` check runs on all cards when current track changes. Move check to parent, only pass boolean to playing track.
  - ? Is this causing visible jank, or just theoretical?

## Questionable backlog

Items here need a decision: promote to backlog, park, or remove.

- allow users to mark a musicbrainz or discogs meta track data as wrong. Since we auto-match on the track title, there's a relatively high chance it's wrong. If it's wrong, users can delete the meta data for that track. But then it'd just match it again on reload. How do we deal with this, do we spend effort on this?
  - ? Alternative: don't show auto-matched data, or show with "unverified" badge?
  - ? How often is the matching wrong? Is this a real complaint?

- local file player for mp3/m4a uploads
  - ? This changes the product significantly (YouTube curation → music hosting). Is that the direction?
  - ? Keep, park, or remove?

- find a way to share `track_meta` data between users. push it remote, how? security?
  - ? What's the use case — collaborative metadata curation?
  - ? Keep, park, or remove?

- consider integrating "bandsintown" as a third-party API similar to musicbrainz, youtube meta - rich data connections
  - ? Is this a real user request? What would it enable?
  - ? Keep, park, or remove?

## Meta questions

Answer these to help prioritize:

- ? Top 3 user complaints right now?
