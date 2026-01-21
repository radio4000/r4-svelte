<script>
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {eq} from '@tanstack/db'
	import {page} from '$app/state'
	import {channelsCollection, tracksCollection, checkTracksFreshness} from '$lib/tanstack/collections'
	import Tracklist from '$lib/components/tracklist.svelte'
	import {appState} from '$lib/app-state.svelte'
	import * as m from '$lib/paraglide/messages'

	let slug = $derived(page.params.slug)

	// Check if remote has newer tracks on page load
	$effect(() => {
		if (slug) checkTracksFreshness(slug)
	})

	// Live query triggers fetch on cache miss
	const tracksQuery = useLiveQuery((q) =>
		q
			.from({tracks: tracksCollection})
			.where(({tracks}) => eq(tracks.slug, slug))
			.orderBy(({tracks}) => tracks.created_at, 'desc')
	)

	let channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))
	let canEdit = $derived(!!appState.user && appState.channels?.includes(channel?.id))

	function openAddTrackModal() {
		appState.modal_track_add = {}
	}
</script>

<svelte:head>
	<title>{m.channel_page_title({name: channel?.name || m.channel_page_fallback()})}</title>
</svelte:head>

{#if channel}
	<section>
		{#if tracksQuery.data.length > 0}
			<Tracklist tracks={tracksQuery.data} {canEdit} grouped={true} virtual={false} />
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
</style>
