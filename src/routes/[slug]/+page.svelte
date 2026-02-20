<script lang="ts">
	import {page} from '$app/state'
	import {getTracksQueryCtx} from '$lib/contexts'
	import {canEditChannel} from '$lib/app-state.svelte'
	import {channelsCollection} from '$lib/tanstack/collections'
	import Tracklist from '$lib/components/tracklist.svelte'
	import LinkEntities from '$lib/components/link-entities.svelte'
	import {relativeDate} from '$lib/dates'
	import * as m from '$lib/paraglide/messages'

	const PREVIEW_LIMIT = 10

	const tracksQuery = getTracksQueryCtx()

	let slug = $derived(page.params.slug)
	let channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))
	let allTracks = $derived(tracksQuery.data || [])
	let previewTracks = $derived(allTracks.slice(0, PREVIEW_LIMIT))
	let canEdit = $derived(canEditChannel(channel?.id))
</script>

<svelte:head>
	<title>{m.channel_page_title({name: channel?.name || m.channel_page_fallback()})}</title>
</svelte:head>

{#if channel}
	<section>
		<div class="channel-meta">
			<p class="dates">
				<small>{m.channel_updated({date: relativeDate(channel.latest_track_at ?? channel.updated_at)})}</small>
			</p>
			{#if channel.url}
				<p class="url"><a href={channel.url} target="_blank" rel="noopener">{channel.url}</a></p>
			{/if}
			{#if channel.description}
				<p class="description"><LinkEntities slug={channel.slug} text={channel.description} /></p>
			{/if}
		</div>

		{#if tracksQuery.isReady && previewTracks.length > 0}
			<Tracklist tracks={previewTracks} {canEdit} grouped={false} virtual={false} playContext={true} />
		{/if}

		<footer>
			{#if tracksQuery.isLoading && (channel.track_count ?? 0) > 0}
				<p class="empty">{m.channel_loading_tracks()}</p>
			{:else if tracksQuery.isReady && allTracks.length === 0}
				{#if canEdit}
					<p class="empty">
						<a href="/add">Add your first track (tip: press "c")</a>
					</p>
				{:else}
					<p class="empty">No tracks yet</p>
				{/if}
			{/if}
			{#if allTracks.length > 0}
				<a href="/{slug}/tracks" class="show-all">
					{allTracks.length > PREVIEW_LIMIT
						? `Show all ${allTracks.length} tracks`
						: `All tracks (${allTracks.length})`}
				</a>
			{/if}
		</footer>
	</section>
{/if}

<style>
	.channel-meta {
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		border-bottom: 1px solid var(--gray-4);
	}

	.dates {
		color: var(--gray-10);
	}

	.description {
		white-space: pre-wrap;
	}

	.url {
		font-style: italic;
		color: var(--gray-9);
	}

	.url a {
		color: inherit;
	}

	.empty {
		padding: 1rem;
	}

	footer {
		padding: 0.75rem 1rem;
		text-align: center;
		border-top: 1px solid var(--gray-4);
	}

	.show-all {
		display: inline-block;
	}
</style>
