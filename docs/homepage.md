# Homepage & browse

## Routes

| Route                 | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| `/`                   | Personalized homepage — your channel, followed channels, feed |
| `/feed`               | Reverse-chronological track timeline from followed channels   |
| `/channels/favorites` | Signed-in favorites filter in the channel browser             |
| `/channels/*`         | Channel browser                                               |
| `/tracks/*`           | Track browser                                                 |
| `/tags/*`             | Tag browser                                                   |
| `/explore/*`          | Legacy URLs redirecting to the routes above                   |

---

## Homepage (`/`)

The homepage adapts to who is logged in and what they follow.

**Not logged in:**

- Featured channels in a taller grid section
- Link to `/channels/featured`
- Welcome hint with sign in / learn more
- App stats shown as a footer-style summary below featured channels

**Logged in, no channel yet:**

- CTA to create a channel
- 3 featured channels
- Link to `/channels/featured`

**Logged in with a channel:**

- Dashboard widgets for their channel, tracks, favorites, live radios, audience, broadcast status, and auto-radio status
- If their channel is still incomplete (no tracks, no follows, or no image), show a dismissible onboarding checklist inside the dashboard until all steps are done
- Their own channel card in list display
- Favorite channels currently broadcasting (list)
- **Feed tab** visible only when signed in
- Sticky browse header can show quick controls for your channel: play/pause, live badge while broadcasting, auto-radio state
- Homepage audience widget uses realtime `channelPresence` and shows both total listeners and live broadcast listeners for the user's channel

### Feed tab

The feed is a **reverse-chronological track timeline from followed channels** — what curators you follow have been adding recently. Conceptually: a social reading list for music, not a recommendation engine.

**What it shows:** tracks already loaded into `tracksCollection.state` that belong to followed channel slugs, sorted by `created_at` desc, limited to 50.

**On first feed tab visit**, it eagerly calls `ensureTracksLoaded` for the 10 most recently active followed channels (ranked by `latest_track_at`). This gives recent tracks quickly without fetching all 200+ followed channels.

**Limitation:** the feed only shows tracks that are in the local DB. Channels the user has never visited (and that aren't in the top-10 eager load) show nothing until visited. This is intentional — loading all tracks for all followed channels would be prohibitively expensive (e.g. 200 channels × 1500 tracks = 300k rows).

The feed improves over time as the user browses channels: every channel page visit loads that channel's tracks into the local DB, which then appear in the feed.

### Reactivity

`followedChannels` and `feedTracks` are `$derived.by` computations reading from `channelsCollection.state` and `tracksCollection.state` directly — **not** `useLiveQuery`. This avoids the cascade of `createLiveQueryCollection` rebuilds that a chained useLiveQuery approach would trigger (one per follow ID change, crashing the tab with 200 follows).

Only `followsQuery` uses `useLiveQuery` (on `followsCollection`).

---

## Featured channels algorithm

Used on the homepage (top 3) and as the default filter on `/channels/featured` (top 12).

```ts
function featuredScore(channel) {
	const followers = channel.followers?.length ?? 0
	const tracks = channel.track_count ?? 0
	const latest = channel.latest_track_at
	let recency = 0
	if (latest) {
		const days = (Date.now() - new Date(latest).getTime()) / 86400000
		if (days <= 30) recency = 3
		else if (days <= 90) recency = 2
		else if (days <= 180) recency = 1
	}
	return followers * 3 + Math.log(tracks + 1) * 2 + recency
}
```

Quality pool: `trackCountGte: 10, imageNotNull: true, limit: 50` fetched from remote, then scored and sliced client-side. No DB changes needed.

`featuredScore` lives in `src/lib/utils.ts`.

---

## Browse routes

`/channels/featured` is the old explore page, moved. It uses `<Channels defaultFilter="featured" />`. The `featured` filter:

- Fetches a quality pool from remote (track_count ≥ 10, has image, limit 50)
- Scores client-side with `featuredScore`
- Shows top 12 in the grid
- Hides sort controls (pre-ranked, sorting would be confusing)
- Info button (circle-info icon) opens a dialog explaining the ranking

`featured` is also the new default for `channels_filter` in `appState`.

Legacy `/explore/*` URLs remain as redirect shims so old links and bookmarks still work.

---

## Files

| File                                        | Role                                           |
| ------------------------------------------- | ---------------------------------------------- |
| `src/routes/+page.svelte`                   | Personalized homepage                          |
| `src/routes/+page.js`                       | Homepage route config                          |
| `src/routes/channels/[filter]/+page.svelte` | Channel browser                                |
| `src/routes/tracks/[filter]/+page.svelte`   | Track browser                                  |
| `src/routes/tags/[filter]/+page.svelte`     | Tag browser                                    |
| `src/routes/explore/**/+page.js`            | Legacy redirect shims                          |
| `src/lib/components/channels.svelte`        | Added `featured` filter + `defaultFilter` prop |
| `src/lib/utils.ts`                          | `featuredScore(channel)`                       |
| `src/lib/components/layout-header.svelte`   | Header nav                                     |
