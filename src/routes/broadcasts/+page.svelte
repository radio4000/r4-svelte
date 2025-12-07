<script>
	import {appState} from '$lib/app-state.svelte'
	import {joinBroadcast, leaveBroadcast, watchBroadcasts} from '$lib/broadcast'
	import BroadcastControls from '$lib/components/broadcast-controls.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import EnsureTrack from '$lib/components/ensure-track.svelte'
	import {timeAgo} from '$lib/utils'
	import * as m from '$lib/paraglide/messages'

	/** @type {{broadcasts: import('$lib/types').BroadcastWithChannel[], error: string | null}} */
	const broadcastState = $state({
		broadcasts: [],
		error: null
	})

	const activeBroadcasts = $derived(broadcastState.broadcasts)
	const loadingError = $derived(broadcastState.error)

	const unsubscribe = watchBroadcasts((data) => {
		broadcastState.broadcasts = data.broadcasts
		broadcastState.error = data.error
	})

	$effect(() => {
		return unsubscribe
	})
</script>

<svelte:head>
	<title>{m.page_title_broadcasts()}</title>
</svelte:head>

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
		<div class:active={joined}>
			<div class="live-dot"></div>
			<ChannelCard channel={broadcast.channels}>
				<p>
					<span class="live">{m.broadcasts_live()}</span>
					{m.broadcasts_since()}
					{timeAgo(broadcast.track_played_at)}
					<em>
						<EnsureTrack tid={broadcast.track_id}></EnsureTrack>
					</em>
				</p>

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
			</ChannelCard>
		</div>
	{:else}
		<p>{m.broadcasts_none()}</p>
	{/each}
</section>

<style>
	header,
	section {
		margin: 0.5rem;
	}

	header > menu {
		margin: 1rem;
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
		background: var(--color-red);
		color: var(--gray-12);
		padding: 0 0.5rem;
		border-radius: var(--border-radius);
	}
</style>
