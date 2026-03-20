<script lang="ts">
	import {eq} from '@tanstack/db'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import {followsCollection} from '$lib/collections/follows'
	import type {BroadcastWithChannel} from '$lib/types'

	// Favorite broadcasts: innerJoin broadcasts × follows
	const favQuery = useLiveQuery((q) =>
		q.from({b: broadcastsCollection}).innerJoin({f: followsCollection}, ({b, f}) => eq(b.channel_id, f.id))
	)
	const favBroadcasts = $derived((favQuery.data ?? []) as Array<{b: BroadcastWithChannel; f: {id: string}}>)
</script>

<div class="constrained">
	<menu class="nav-grouped">
		<a href="/_debug">&larr;</a>
	</menu>

	<h1>Favorite broadcasts</h1>
	<p>Followed channels that are currently broadcasting.</p>

	<p>Status: <code>{favQuery.status}</code> · Count: <strong>{favBroadcasts.length}</strong></p>

	{#if favQuery.isLoading}
		<p>Loading…</p>
	{:else if !favBroadcasts.length}
		<p>None of your followed channels are broadcasting right now.</p>
	{:else}
		<table>
			<thead>
				<tr><th>channel</th><th>decks</th><th>track played at</th></tr>
			</thead>
			<tbody>
				{#each favBroadcasts as row (row.b.channel_id)}
					{@const ch = row.b.channels}
					<tr>
						<td><a href="/@{ch?.slug ?? row.b.channel_id}">{ch?.name ?? row.b.channel_id}</a></td>
						<td>{row.b.decks?.length ?? 0}</td>
						<td>{row.b.track_played_at ? new Date(row.b.track_played_at).toLocaleTimeString() : '-'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
