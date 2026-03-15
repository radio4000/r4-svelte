# Homepage & Explore

## Routes

| Route      | Purpose                                                       |
| ---------- | ------------------------------------------------------------- |
| `/`        | Personalized homepage — your channel, followed channels, feed |
| `/explore` | Channel browser (the old homepage)                            |

---

## Homepage (`/`)

The homepage adapts to who is logged in and what they follow.

**Not logged in:**

- 3 featured channels (algorithmically ranked)
- Link to `/explore`
- Welcome hint with sign in / learn more

**Logged in, no channel yet:**

- CTA to create a channel
- 3 featured channels
- Link to `/explore`

**Logged in with a channel:**

- Their own channel (list display — one card, horizontal)
- Channels they follow (grid)
- Link to `/explore`
- **Feed tab** visible when following at least one channel

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

Used on the homepage (top 3) and as the default filter on `/explore` (top 12).

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

## Explore (`/explore`)

The old homepage, moved. Uses `<Channels defaultFilter="featured" />`. The `featured` filter:

- Fetches a quality pool from remote (track_count ≥ 10, has image, limit 50)
- Scores client-side with `featuredScore`
- Shows top 12 in the grid
- Hides sort controls (pre-ranked, sorting would be confusing)
- Info button (circle-info icon) opens a dialog explaining the ranking

`featured` is also the new default for `channels_filter` in `appState`.

---

## Files

| File                                      | Role                                           |
| ----------------------------------------- | ---------------------------------------------- |
| `src/routes/+page.svelte`                 | Personalized homepage                          |
| `src/routes/+page.js`                     | Minimal load (ssr=false, awaits parent)        |
| `src/routes/explore/+page.svelte`         | Channel browser                                |
| `src/routes/explore/+page.js`             | Load function (passes display param)           |
| `src/lib/components/channels.svelte`      | Added `featured` filter + `defaultFilter` prop |
| `src/lib/utils.ts`                        | `featuredScore(channel)`                       |
| `src/lib/components/layout-header.svelte` | Explore nav link (globe icon)                  |
