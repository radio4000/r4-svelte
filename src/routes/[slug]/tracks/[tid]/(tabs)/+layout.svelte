<script>
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {getChannelCtx, getTracksQueryCtx, setTrackDetailCtx} from '$lib/contexts'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {eq, and} from '@tanstack/db'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {trackMetaCollection} from '$lib/collections/track-meta'
	import TrackCard from '$lib/components/track-card.svelte'
	import Icon from '$lib/components/icon.svelte'
	import {channelAvatarUrl, trackImageUrl} from '$lib/utils'
	import * as m from '$lib/paraglide/messages'
	import Seo from '$lib/components/seo.svelte'

	let {data, children} = $props()
	const pathname = $derived(page.url.pathname)

	const channelCtx = getChannelCtx()
	const tracksQuery = getTracksQueryCtx()
	const channel = $derived(channelCtx.data)
	const canEdit = $derived(canEditChannel(channel?.id))
	const track = $derived(tracksQuery.data?.find((t) => t.id === data.tid))
	const isTrackPlaying = $derived(
		Boolean(track?.id && Object.values(appState.decks).some((d) => d.playlist_track === track.id))
	)
	const trackProvider = $derived(track?.provider ?? null)
	const trackMediaId = $derived(track?.media_id ?? null)
	const isYoutubeTrack = $derived(trackProvider === 'youtube')
	const relatedTracks = $derived.by(() => {
		if (!trackMediaId || !track?.id) return []
		return (tracksQuery.data ?? []).filter((t) => {
			return (
				t.id !== track.id && t.media_id === trackMediaId && (t.provider ?? null) === trackProvider
			)
		})
	})
	const metaQuery = useLiveQuery((q) =>
		q
			.from({meta: trackMetaCollection})
			.where(({meta}) =>
				and(eq(meta.media_id, trackMediaId || ''), eq(meta.provider, trackProvider))
			)
			.orderBy(({meta}) => meta.media_id)
			.limit(1)
	)
	const meta = $derived(metaQuery.data?.[0])
	const ogImage = $derived(
		isYoutubeTrack && trackMediaId
			? trackImageUrl(trackMediaId, 'hqdefault')
			: channel?.image
				? channelAvatarUrl(channel.image)
				: undefined
	)
	const isLoading = $derived(tracksQuery.isLoading)
	const hasYoutubeInfo = $derived(
		Boolean(meta?.youtube_data && Object.keys(meta.youtube_data).length > 0)
	)
	const hasMusicbrainzInfo = $derived(
		Boolean(meta?.musicbrainz_data && 'recording' in meta.musicbrainz_data)
	)
	const hasDiscogsInfo = $derived(
		Boolean(track?.discogs_url || (meta?.discogs_data && Object.keys(meta.discogs_data).length > 0))
	)

	const detail = $state(
		/** @type {import('$lib/contexts').TrackDetailCtx} */ ({
			track: undefined,
			trackProvider: null,
			trackMediaId: null,
			channel: undefined,
			canEdit: false,
			meta: undefined,
			tracks: [],
			relatedTracks: [],
			hasYoutubeInfo: false,
			hasMusicbrainzInfo: false,
			hasDiscogsInfo: false
		})
	)
	setTrackDetailCtx(detail)

	$effect(() => {
		Object.assign(detail, {
			track,
			trackProvider,
			trackMediaId,
			channel,
			canEdit,
			meta,
			tracks: tracksQuery.data ?? [],
			relatedTracks,
			hasYoutubeInfo,
			hasMusicbrainzInfo,
			hasDiscogsInfo
		})
	})
</script>

<Seo
	title={track?.title || m.track_meta_title()}
	description={track?.description}
	image={ogImage}
	url={page.url.href}
	type="music.song"
/>

{#if isLoading}
	<p>{m.common_loading()}</p>
{:else if !track || !channel}
	<p>{m.track_not_found()}</p>
{:else}
	<div class="track-sticky">
		<ul class="list track-current" class:playing={isTrackPlaying}>
			<li><TrackCard {track} {canEdit} /></li>
		</ul>
		<nav class="track-nav chip-tabs" aria-label={m.track_meta_title()}>
			<a href={`/${data.slug}/tracks#track-${data.tid}`} class="btn chip" aria-label="Back to tracks">
				<Icon icon="arrow-left" />
			</a>
			<a
				href={resolve(`/${data.slug}/tracks/${data.tid}`)}
				class="btn chip"
				class:active={pathname === `/${data.slug}/tracks/${data.tid}`}
			>
				<Icon icon="circle-info" />
				{m.track_detail_nav_r5()}
			</a>
			<a
				href={resolve(`/${data.slug}/tracks/${data.tid}/related`)}
				class="btn chip"
				class:active={pathname === `/${data.slug}/tracks/${data.tid}/related`}
			>
				<Icon icon="sparkles" />
				{m.track_detail_nav_related()}
			</a>
			{#if isYoutubeTrack || hasYoutubeInfo}
				<a
					href={resolve(`/${data.slug}/tracks/${data.tid}/youtube`)}
					class="btn chip"
					class:active={pathname === `/${data.slug}/tracks/${data.tid}/youtube`}
				>
					<Icon icon="play-fill" />
					{m.track_detail_nav_youtube()}
				</a>
			{/if}
			<a
				href={resolve(`/${data.slug}/tracks/${data.tid}/discogs`)}
				class="btn chip"
				class:active={pathname === `/${data.slug}/tracks/${data.tid}/discogs`}
			>
				<Icon icon="book" />
				{m.track_detail_nav_discogs()}
			</a>
			<a
				href={resolve(`/${data.slug}/tracks/${data.tid}/musicbrainz`)}
				class="btn chip"
				class:active={pathname === `/${data.slug}/tracks/${data.tid}/musicbrainz`}
			>
				<Icon icon="code-branch" />
				{m.track_detail_nav_musicbrainz()}
			</a>
			{#if canEdit}
				<a
					href={resolve(`/${data.slug}/tracks/${data.tid}/edit`)}
					class="btn chip"
					class:active={pathname === `/${data.slug}/tracks/${data.tid}/edit`}
					style="margin-inline-start: auto;"
				>
					<Icon icon="edit" />
					{m.common_edit()}
				</a>
			{/if}
		</nav>
	</div>

	<main class="meta">
		{@render children()}
	</main>
{/if}

<style>
	.track-sticky {
		position: sticky;
		top: var(--channel-sticky-height, 0);
		z-index: 10;
		background: var(--color-interface);
	}

	.track-nav {
		display: flex;
		flex-wrap: nowrap;
		overflow-x: auto;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.5rem;
	}

	.meta {
		padding: 0.5rem;
	}

	.meta :global(pre) {
		max-width: 100%;
		overflow-x: auto;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.meta :global(pre code) {
		white-space: inherit;
	}

	.track-current {
		margin: 0;
		padding: 0.75rem 1rem;
	}

	.track-current.playing {
		background: var(--accent-2);
	}
</style>
