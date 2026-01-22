<script>
	import {appState} from '$lib/app-state.svelte'
	import {joinBroadcast, leaveBroadcast} from '$lib/broadcast'
	import BroadcastControls from '$lib/components/broadcast-controls.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {broadcastsCollection} from '$lib/tanstack/collections'
	import {timeAgo} from '$lib/utils'
	import * as m from '$lib/paraglide/messages'

	const broadcasts = useLiveQuery(broadcastsCollection)
	const activeBroadcasts = $derived(broadcasts.data ?? [])
	const loading = $derived(broadcasts.isLoading)
	const loadingError = $derived(broadcasts.isError ? 'Failed to load broadcasts' : null)
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
			<BroadcastControls />
		</menu>
	</header>

	<section class="list">
		{#each activeBroadcasts as broadcast (broadcast.channel_id)}
			{@const joined = broadcast.channel_id === appState.listening_to_channel_id}
			{@const isOwnChannel = broadcast.channel_id === appState.channels?.[0]}
			<div class:active={joined}>
				<ChannelCard channel={broadcast.channels}>
					<p>
						<span class="live">{isOwnChannel ? m.broadcasts_you_are_live() : m.broadcasts_live()}</span>
						{#if !isOwnChannel}
							{m.broadcasts_since()}
							{timeAgo(broadcast.track_played_at)}
						{/if}
						{#if broadcast.tracks}
							<em>{broadcast.tracks.title}</em> via
							<a href="/{broadcast.channels.slug}">@{broadcast.channels.slug}</a>
						{:else}
							<em>...</em>
						{/if}
					</p>

					{#if !isOwnChannel}
						<button
							type="button"
							onclick={(e) => {
								e.preventDefault()
								if (joined) {
									leaveBroadcast()
								} else {
									joinBroadcast(broadcast.channel_id)
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
