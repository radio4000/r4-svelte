<script>
	import {page} from '$app/state'
	import {getTracksQueryCtx} from '$lib/contexts'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {eq} from '@tanstack/db'
	import {canEditChannel} from '$lib/app-state.svelte'
	import {channelsCollection, trackMetaCollection} from '$lib/tanstack/collections'
	import TrackCard from '$lib/components/track-card.svelte'
	import TrackMeta from '$lib/components/track-meta.svelte'
	import TrackMetaDiscogs from '$lib/components/track-meta-discogs.svelte'
	import TrackMetaMusicbrainz from '$lib/components/track-meta-musicbrainz.svelte'
	import TrackMetaR5 from '$lib/components/track-meta-r5.svelte'
	import TrackMetaYoutube from '$lib/components/track-meta-youtube.svelte'
	import TrackRelated from '$lib/components/track-related.svelte'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	let {data} = $props()

	// Reuse tracksQuery from layout (already loaded)
	const tracksQuery = getTracksQueryCtx()

	// Channel is already loaded in layout, read from collection
	const channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === data.slug))
	const canEdit = $derived(canEditChannel(channel?.id))

	// Find track by ID from already-loaded tracks
	const track = $derived(tracksQuery.data?.find((t) => t.id === data.tid))
	const mediaId = $derived(track?.media_id ?? null)

	// Reactive query on trackMetaCollection - re-renders when metadata updates
	const metaQuery = useLiveQuery((q) =>
		q
			.from({meta: trackMetaCollection})
			.where(({meta}) => eq(meta.media_id, mediaId || ''))
			.orderBy(({meta}) => meta.media_id)
			.limit(1)
	)

	const meta = $derived(metaQuery.data?.[0])
	const activeTab = $derived(page.url.searchParams.get('tab') || 'r5')
	const isLoading = $derived(tracksQuery.isLoading)
</script>

<svelte:head>
	<title>
		{m.track_detail_page_title({
			track: track?.title || m.track_meta_title(),
			channel: channel?.name || m.channel_page_fallback()
		})}
	</title>
</svelte:head>

{#if isLoading}
	<p>Loading…</p>
{:else if !track || !channel}
	<p>
		Track not found (tid: {data.tid}, slug: {data.slug}, tracks loaded: {tracksQuery.data?.length ?? 0}, first track id: {tracksQuery
			.data?.[0]?.id})
	</p>
{:else}
	<ul class="list HIGHLIGHT">
		<li><TrackCard {track} {canEdit} /></li>
	</ul>
	<article>
		<header>
			<nav class="tabs track-tabs">
				<a href="?tab=r5" class:active={activeTab === 'r5' || !activeTab}>
					<Icon icon="circle-info" size={16} />
					{m.track_detail_nav_r5()}
				</a>
				<a href="?tab=youtube" class:active={activeTab === 'youtube'}>
					<Icon icon="play-fill" size={16} />
					{m.track_detail_nav_youtube()}
				</a>
				<a href="?tab=musicbrainz" class:active={activeTab === 'musicbrainz'}>
					<Icon icon="code-branch" size={16} />
					{m.track_detail_nav_musicbrainz()}
				</a>
				<a href="?tab=discogs" class:active={activeTab === 'discogs'}>
					<Icon icon="tag" size={16} />
					{m.track_detail_nav_discogs()}
				</a>
				<a href="?tab=related" class:active={activeTab === 'related'}>
					<Icon icon="sparkles" size={16} />
					{m.track_detail_nav_related()}
				</a>
			</nav>
		</header>

		<main class="meta">
			{#if activeTab === 'youtube'}
				<TrackMetaYoutube data={meta?.youtube_data} />
			{:else if activeTab === 'musicbrainz'}
				<TrackMetaMusicbrainz data={meta?.musicbrainz_data} {track} />
			{:else if activeTab === 'discogs'}
				<TrackMetaDiscogs data={meta?.discogs_data} {track} tracks={tracksQuery.data ?? []} {channel} {canEdit} />
			{:else if activeTab === 'related'}
				<TrackRelated {track} />
			{:else}
				<TrackMetaR5 data={track} />
			{/if}
		</main>

		<hr />

		<TrackMeta {track} {channel} />
	</article>
{/if}

<style>
	.track-tabs {
		margin: 0.5rem 0;
		border-bottom: 1px solid light-dark(var(--gray-5), var(--gray-5));
		text-transform: capitalize;
	}

	.meta {
		padding: 0.5rem;
	}

	.HIGHLIGHT {
		margin: 0;
		background: var(--accent-2);
		/*border: 2px solid var(--accent-2);*/
	}

	:global(code) {
		white-space: pre-wrap;
	}
</style>
