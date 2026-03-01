# Followers

Follow/save channels as favorites. Stored in `followers` table with `follower_id` and `channel_id`.

## Behavior

**unauthenticated**: follow button hidden

**authenticated**: on login, invalidates the follows query to trigger a fresh fetch. Button updates optimistically.

## Collection

Uses `queryCollectionOptions` like other collections. Data flows through query cache (persisted to IDB). See `src/lib/tanstack/collections/follows.ts`.

## API

```ts
followChannel(channelId) // optimistic insert + sync to remote
unfollowChannel(channelId) // optimistic delete + sync to remote
loadUserFollows() // invalidates query to trigger refetch
```

Follow/unfollow use `utils.writeInsert`/`utils.writeDelete` for optimistic updates with rollback on error.

## Button

Each button has its own `useLiveQuery`:

```ts
const followQuery = useLiveQuery((q) =>
	q.from({follows: followsCollection}).where(({follows}) => eq(follows.id, channel.id))
)
let following = $derived(followQuery.data?.length > 0)
```

## Pages

Followers/following pages fetch directly via SDK (not from collection). Display settings (list/grid view) persist across visits.

```ts
sdk.channels.readFollowers(channelId) // who follows this channel
sdk.channels.readFollowings(channelId) // who this channel follows
```

## Files

- `src/lib/tanstack/collections/follows.ts` - collection + functions
- `src/lib/components/button-follow.svelte` - follow button
- `src/lib/components/auth-listener.svelte` - calls loadUserFollows on auth
- `src/routes/[slug]/followers/+page.svelte` - who follows this channel
- `src/routes/[slug]/following/+page.svelte` - who this channel follows
