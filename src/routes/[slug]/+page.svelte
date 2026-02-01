<script module>
	import {SvelteMap} from 'svelte/reactivity'
	// Track render limit per channel (persists during session)
	const channelLimits = new SvelteMap()
</script>

<script>
	import {page} from '$app/state'
	import {getContext} from 'svelte'
	import {channelsCollection} from '$lib/tanstack/collections'
	import Tracklist from '$lib/components/tracklist.svelte'
	import {appState} from '$lib/app-state.svelte'
	import * as m from '$lib/paraglide/messages'

	let slug = $derived(page.params.slug)
	let renderLimit = $derived(channelLimits.get(slug) ?? 40)

	// Get tracks from layout (query stays alive during navigation)
	const tracksQuery = getContext('tracksQuery')
	const getCanEdit = getContext('canEdit')

	let allTracks = $derived(tracksQuery.data || [])
	let tracks = $derived(renderLimit ? allTracks.slice(0, renderLimit) : allTracks)
	let canEdit = $derived(getCanEdit())

	let channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))
	let hasMore = $derived(renderLimit && allTracks.length > renderLimit)

	function showAll() {
		channelLimits.set(slug, 0)
	}

	function openAddTrackModal() {
		appState.modal_track_add = {}
	}
</script>

<svelte:head>
	<title>{m.channel_page_title({name: channel?.name || m.channel_page_fallback()})}</title>
</svelte:head>

{#if channel}
	<section>
		{#if tracksQuery.isReady && tracks.length > 0}
			<Tracklist {tracks} {canEdit} grouped={false} virtual={false} />
			{#if hasMore}
				<footer>
					<button onclick={showAll}>Show all {allTracks.length} tracks</button>
				</footer>
			{/if}
		{:else if (channel.track_count ?? 0) > 0}
			<p class="empty">{m.channel_loading_tracks()}</p>
		{:else if canEdit}
			<p class="empty">
				No tracks yet.
				<button onclick={openAddTrackModal}>Add your first track</button>
			</p>
		{:else}
			<p class="empty">No tracks yet</p>
		{/if}
	</section>
{/if}

<style>
	.empty {
		padding: 1rem;
	}
	footer {
		padding: 1rem;
		text-align: center;
	}
</style>
