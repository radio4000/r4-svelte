<script>
	import {page} from '$app/state'
	import {tracksCollection, channelsCollection, trackMetaCollection} from '$lib/collections'
	import {useLiveQuery} from '$lib/tanstack-svelte-db-useLiveQuery-patched.svelte'
	import {eq} from '@tanstack/svelte-db'
	import {extractYouTubeId} from '$lib/utils'
	import TrackCard from '$lib/components/track-card.svelte'
	import TrackMeta from '$lib/components/track-meta.svelte'
	import TrackMetaDiscogs from '$lib/components/track-meta-discogs.svelte'
	import TrackMetaMusicbrainz from '$lib/components/track-meta-musicbrainz.svelte'
	import TrackMetaR5 from '$lib/components/track-meta-r5.svelte'
	import TrackMetaYoutube from '$lib/components/track-meta-youtube.svelte'
	import TrackRelated from '$lib/components/track-related.svelte'

	let {data} = $props()
	const {slug, tid} = data

	// Live query for track
	const trackQuery = useLiveQuery(
		(q) => {
			if (!tid) return undefined
			return q
				.from({track: tracksCollection})
				.where(({track}) => eq(track.id, tid))
				.findOne()
		},
		[tid]
	)
	const baseTrack = $derived(trackQuery.data)

	// Live query for channel
	const channelQuery = useLiveQuery(
		(q) => {
			if (!slug) return undefined
			return q
				.from({channel: channelsCollection})
				.where(({channel}) => eq(channel.slug, slug))
				.findOne()
		},
		[slug]
	)
	const channel = $derived(channelQuery.data)

	// Get ytid for metadata lookup
	const ytid = $derived(baseTrack?.ytid || (baseTrack?.url ? extractYouTubeId(baseTrack.url) : null))

	// Find metadata from collection (localStorage collection, direct access)
	const meta = $derived(ytid ? trackMetaCollection.toArray.find((m) => m.ytid === ytid) : undefined)

	// Merge track with metadata
	const track = $derived(
		baseTrack
			? {
					...baseTrack,
					duration: meta?.duration || baseTrack.duration,
					youtube_data: meta?.youtube_data || baseTrack.youtube_data,
					musicbrainz_data: meta?.musicbrainz_data || baseTrack.musicbrainz_data,
					discogs_data: meta?.discogs_data || baseTrack.discogs_data
				}
			: undefined
	)

	const activeTab = $derived(page.url.searchParams.get('tab') || 'r5')

	function updateTrackMeta(meta) {
		console.log('Metadata updated:', meta)
		// Data will auto-update via reactive $derived
	}
</script>

<svelte:head>
	<title>{track?.title || 'Track'} by {channel?.name || 'Channel'} - R5</title>
</svelte:head>

{#if !track || !channel}
	<p>Loading...</p>
{:else}
	<article>
		<header>
			<p><a href="/{channel.slug}">@{channel.slug}</a> / {track.title}</p>
			<menu class="tree">
				<a href="?tab=r5" class:active={activeTab === 'r5' || !activeTab}>r5</a>
				<a href="?tab=youtube" class:active={activeTab === 'youtube'}>youtube</a>
				<a href="?tab=musicbrainz" class:active={activeTab === 'musicbrainz'}>musicbrainz</a>
				<a href="?tab=discogs" class:active={activeTab === 'discogs'}>discogs</a>
				<a href="?tab=related" class:active={activeTab === 'related'}>related</a>
			</menu>
			<!-- <ChannelCard {channel} /> -->
			<!-- <ButtonPlay {channel} /> -->
		</header>

		{#if activeTab === 'youtube'}
			<TrackMetaYoutube data={track.youtube_data} {track} />
		{:else if activeTab === 'musicbrainz'}
			<TrackMetaMusicbrainz data={track.musicbrainz_data} {track} />
		{:else if activeTab === 'discogs'}
			<TrackMetaDiscogs data={track.discogs_data} {track} />
		{:else if activeTab === 'related'}
			<TrackRelated {track} />
		{:else}
			<TrackCard {track} />
			<TrackMetaR5 data={track} />
		{/if}

		<hr />
		<TrackMeta {track} onResult={updateTrackMeta} />
	</article>
{/if}

<style>
	article {
		margin: 0.5rem 0.5rem var(--player-compact-size);
	}

	pre {
		font-size: var(--font-3);
	}

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
