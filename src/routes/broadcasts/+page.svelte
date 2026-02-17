<script>
	import {onDestroy} from 'svelte'
	import {appState} from '$lib/app-state.svelte'
	import {joinBroadcast, leaveBroadcast} from '$lib/broadcast'
	import BroadcastControls from '$lib/components/broadcast-controls.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {broadcastsCollection, tracksCollection} from '$lib/tanstack/collections'
	import {timeAgo} from '$lib/utils'
	import {SvelteMap} from 'svelte/reactivity'
	import {sdk} from '@radio4000/sdk'
	import * as m from '$lib/paraglide/messages'

	const broadcasts = useLiveQuery(broadcastsCollection)
	const activeBroadcasts = $derived(broadcasts.data ?? [])
	const loading = $derived(broadcasts.isLoading)
	const loadingError = $derived(broadcasts.isError ? 'Failed to load broadcasts' : null)

	const deckStatesByChannel = new SvelteMap()
	const stateChannels = new SvelteMap()

	$effect(() => {
		const channelIds = new Set(activeBroadcasts.map((b) => b.channel_id))

		for (const id of channelIds) {
			if (stateChannels.has(id)) continue
			const channel = sdk.supabase
				.channel(`broadcast-state:${id}`)
				.on('broadcast', {event: 'state'}, (payload) => {
					const decks = payload?.payload?.decks ?? payload?.decks ?? []
					deckStatesByChannel.set(id, Array.isArray(decks) ? decks : [])
				})
				.subscribe((status) => {
					if (status === 'SUBSCRIBED') {
						channel.send({type: 'broadcast', event: 'request_state', payload: {channel_id: id}})
					}
				})
			stateChannels.set(id, channel)
		}

		for (const [id, channel] of stateChannels) {
			if (!channelIds.has(id)) {
				channel.unsubscribe()
				stateChannels.delete(id)
				deckStatesByChannel.delete(id)
			}
		}
	})

	onDestroy(() => {
		for (const channel of stateChannels.values()) channel.unsubscribe()
		stateChannels.clear()
	})

	const getTrackLabel = (trackId) => {
		if (!trackId) return null
		const track = tracksCollection.state.get(trackId)
		return track?.title || trackId.slice(0, 8)
	}
</script>

<svelte:head>
	<title>{m.page_title_broadcasts()}</title>
</svelte:head>

<article class="constrained">
	<header>
		<h1>{m.broadcasts_title()}</h1>
		<p>{m.broadcasts_wip()}</p>

		{#if loadingError}
			<p>{m.broadcasts_error()} {loadingError}</p>
		{/if}

		<menu>
			<BroadcastControls deckId={appState.active_deck_id} />
		</menu>
	</header>

	<section class="list">
		{#each activeBroadcasts as broadcast (broadcast.channel_id)}
			{@const joined = Object.values(appState.decks).some((d) => d.listening_to_channel_id === broadcast.channel_id)}
			{@const isOwnChannel = broadcast.channel_id === appState.channels?.[0]}
			{@const primaryTrackId = deckStatesByChannel.get(broadcast.channel_id)?.[0]?.track_id ?? broadcast.decks?.[0]?.track_id}
			{@const primaryLabel = getTrackLabel(primaryTrackId)}
			<div class:active={joined}>
				<ChannelCard channel={broadcast.channels}>
					<p>
						<span class="live">{isOwnChannel ? m.broadcasts_you_are_live() : m.broadcasts_live()}</span>
						{#if !isOwnChannel}
							{m.broadcasts_since()}
							{timeAgo(broadcast.track_played_at)}
						{/if}
						{#if primaryLabel}
							<em>{primaryLabel}</em> via
							<a href="/{broadcast.channels.slug}">@{broadcast.channels.slug}</a>
						{:else}
							<em>...</em>
						{/if}
					</p>
					{#if deckStatesByChannel.get(broadcast.channel_id)?.length}
						<ul class="list">
							{#each deckStatesByChannel.get(broadcast.channel_id) as deckState, i (i)}
								{@const label = getTrackLabel(deckState?.track_id)}
								<li>
									Deck {i + 1}:
									{#if label}
										<em>{label}</em>
									{:else}
										<em>...</em>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}

					{#if !isOwnChannel}
						<button
							type="button"
							onclick={(e) => {
								e.preventDefault()
								if (joined) {
									leaveBroadcast(appState.active_deck_id)
								} else {
									joinBroadcast(appState.active_deck_id, broadcast.channel_id)
								}
							}}
						>
							{joined ? m.broadcasts_leave() : m.broadcasts_join()}
						</button>
					{/if}
				</ChannelCard>
			</div>
		{:else}
			{#if loading}
				<p class="scanning"><rough-spinner spinner="14" interval="150"></rough-spinner> Scanning the airwaves…</p>
			{:else}
				<p>{m.broadcasts_none()}</p>
			{/if}
		{/each}
	</section>
</article>

<style>
	header > menu {
		margin-block: 1rem;
	}

	.scanning {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-style: italic;
		color: var(--gray-9);
	}

	.list :global(article > a) {
		grid-template-columns: 8rem auto;
		gap: 1rem;
	}

	p:has(.live) {
		margin: 1rem 0;
	}

	.live {
		display: inline-block;
		background: var(--accent-5);
		color: var(--gray-12);
		padding: 0 0.5rem;
		border-radius: var(--border-radius);
	}
</style>
