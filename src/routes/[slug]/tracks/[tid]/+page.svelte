<script>
	import {page} from '$app/state'
	import {getTracksQueryCtx} from '$lib/contexts'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {eq} from '@tanstack/db'
	import {channelsCollection, trackMetaCollection} from '$lib/tanstack/collections'
	import TrackCard from '$lib/components/track-card.svelte'
	import TrackMeta from '$lib/components/track-meta.svelte'
	import TrackMetaDiscogs from '$lib/components/track-meta-discogs.svelte'
	import TrackMetaMusicbrainz from '$lib/components/track-meta-musicbrainz.svelte'
	import TrackMetaR5 from '$lib/components/track-meta-r5.svelte'
	import TrackMetaYoutube from '$lib/components/track-meta-youtube.svelte'
	import TrackRelated from '$lib/components/track-related.svelte'
	import * as m from '$lib/paraglide/messages'

	let {data} = $props()

	// Reuse tracksQuery from layout (already loaded)
	const tracksQuery = getTracksQueryCtx()

	// Channel is already loaded in layout, read from collection
	const channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === data.slug))

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
	<article class="constrained">
		<header>
			<p>
				<a href="/{channel.slug}">@{channel.slug}</a> / {track.title}
			</p>

			<TrackCard {track} />

			<menu class="tree">
				<a href="?tab=r5" class:active={activeTab === 'r5' || !activeTab}>{m.track_detail_nav_r5()}</a>
				<a href="?tab=youtube" class:active={activeTab === 'youtube'}>{m.track_detail_nav_youtube()}</a>
				<a href="?tab=musicbrainz" class:active={activeTab === 'musicbrainz'}>{m.track_detail_nav_musicbrainz()}</a>
				<a href="?tab=discogs" class:active={activeTab === 'discogs'}>{m.track_detail_nav_discogs()}</a>
				<a href="?tab=related" class:active={activeTab === 'related'}>{m.track_detail_nav_related()}</a>
			</menu>
		</header>

		{#if activeTab === 'youtube'}
			<TrackMetaYoutube data={meta?.youtube_data} />
		{:else if activeTab === 'musicbrainz'}
			<TrackMetaMusicbrainz data={meta?.musicbrainz_data} {track} />
		{:else if activeTab === 'discogs'}
			<TrackMetaDiscogs data={meta?.discogs_data} />
		{:else if activeTab === 'related'}
			<TrackRelated {track} />
		{:else}
			<TrackMetaR5 data={track} />
		{/if}

		<hr />
		<TrackMeta {track} {channel} />
	</article>
{/if}

<style>
	.tree {
		margin-left: 2rem;
		display: inline-flex;
		flex-flow: column;
		line-height: 1;

		a {
			text-decoration: none;

			&::before {
				font-family: var(--monospace);
				content: '├──';
				display: inline;
			}

			&.active {
				background: var(--accent-9);
				color: var(--gray-1);

				&::before {
					background: var(--gray-1);
					color: var(--gray-12);
				}
			}
		}
	}
</style>
