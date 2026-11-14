# Homepage & browse

## Routes

| Route                 | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| `/`                   | Personalized homepage — your channel, followed channels, feed |
| `/explore/feed`       | Reverse-chronological track timeline from followed channels   |
| `/explore/channels/*` | Channel browser                                               |
| `/explore/tracks/*`   | Track browser                                                 |
| `/explore/tags/*`     | Tag browser                                                   |
| `/feed`               | Legacy redirect to `/explore/feed`                            |
| `/channels/*`         | Legacy redirects to `/explore/channels/*`                     |
| `/tracks/*`           | Legacy redirects to `/explore/tracks/*`                       |
| `/tags/*`             | Legacy redirects to `/explore/tags/*`                         |

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
- Sticky browse header can show quick controls for your channel: play/pause, live badge while broadcasting, auto-radio state
- Homepage audience widget uses realtime `channelPresence` and shows both total listeners and live broadcast listeners for the user's channel

### Feed

The feed is not on the homepage. It lives at `/explore/tracks/network` (the "Feed" chip on the explore tracks pages; `/feed` and `/explore/feed` redirect there). It is a **reverse-chronological track timeline from followed channels**: what curators you follow have been adding recently. Conceptually a social reading list for music, not a recommendation engine.

It shows every track your followed channels added in the last 30 days, grouped by day. A live query on the tracks collection loads them, one request per 50 followed channels, whether or not you have visited those channels. Signed out, or following nobody, it shows an empty state.

## Featured channels algorithm

Used on the homepage (top 3) and as the default filter on `/explore/channels/featured` (top 12).

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

Quality pool (`getFeaturedPool` in `src/lib/collections/featured.ts`): channels with artwork and at least 10 tracks, active in the last 30 days, newest activity first, then scored and sliced client-side by `pickFeatured`. It is a live query on the channels collection with no order or limit, kept for an hour after its last read. No DB changes needed.

`featuredScore` lives in `src/lib/utils.ts`.

---

## Browse routes

`/explore/channels/featured` is the canonical browse entry for channels. It uses `<Channels defaultFilter="featured" />`. The `featured` filter:

- Fetches a quality pool from remote (track_count ≥ 10, has image, limit 50)
- Scores client-side with `featuredScore`
- Shows top 12 in the grid
- Hides sort controls (pre-ranked, sorting would be confusing)
- Info button (circle-info icon) opens a dialog explaining the ranking

`featured` is also the default for `channels_filter` in `appState`.

Legacy `/channels/*`, `/tracks/*`, `/tags/*`, and `/feed` URLs remain as redirect shims so old links and bookmarks still work.

---

## Files

| File                                                                                                                             | Role                                           |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `src/routes/+page.svelte`                                                                                                        | Personalized homepage                          |
| `src/routes/+page.js`                                                                                                            | Homepage route config                          |
| `src/routes/explore/channels/[filter]/+page.svelte`                                                                              | Channel browser                                |
| `src/routes/explore/tracks/[filter]/+page.svelte`                                                                                | Track browser                                  |
| `src/routes/explore/tags/[filter]/+page.svelte`                                                                                  | Tag browser                                    |
| `src/routes/feed/**/+page.js`, `src/routes/channels/**/+page.js`, `src/routes/tracks/**/+page.js`, `src/routes/tags/**/+page.js` | Legacy redirect shims                          |
| `src/lib/components/channels.svelte`                                                                                             | Added `featured` filter + `defaultFilter` prop |
| `src/lib/utils.ts`                                                                                                               | `featuredScore(channel)`                       |
| `src/lib/components/layout-header.svelte`                                                                                        | Header nav                                     |
