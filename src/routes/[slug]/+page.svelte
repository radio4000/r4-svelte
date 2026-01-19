<script>
	import {useLiveQuery} from '$lib/tanstack/useLiveQuery.svelte.js'
	import {eq} from '@tanstack/db'
	import {page} from '$app/state'
	import {channelsCollection, tracksCollection, checkTracksFreshness} from '$lib/tanstack/collections'
	import ButtonFollow from '$lib/components/button-follow.svelte'
	import ButtonPlay from '$lib/components/button-play.svelte'
	import ChannelHero from '$lib/components/channel-hero.svelte'
	import Icon from '$lib/components/icon.svelte'
	import LinkEntities from '$lib/components/link-entities.svelte'
	import Tracklist from '$lib/components/tracklist.svelte'
	import {relativeDate, relativeDateSolar} from '$lib/dates'
	import {appState} from '$lib/app-state.svelte'
	import * as m from '$lib/paraglide/messages'

	let slug = $derived(page.params.slug)

	// Check if remote has newer tracks on page load
	$effect(() => {
		if (slug) checkTracksFreshness(slug)
	})

	const channelQuery = useLiveQuery((q) =>
		q
			.from({channels: channelsCollection})
			.where(({channels}) => eq(channels.slug, slug))
			.orderBy(({channels}) => channels.created_at, 'desc')
			.limit(1)
	)

	// Live query triggers fetch on cache miss
	const tracksQuery = useLiveQuery((q) =>
		q
			.from({tracks: tracksCollection})
			.where(({tracks}) => eq(tracks.slug, slug))
			.orderBy(({tracks}) => tracks.created_at, 'desc')
	)

	// Collection state (hydrated from cache) or live query data (after fetch)
	const collectionTracks = $derived(
		[...tracksCollection.state.values()]
			.filter((t) => t.slug === slug)
			.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
	)
	let tracks = $derived(collectionTracks.length ? collectionTracks : tracksQuery.data || [])

	let channel = $derived(channelQuery.data?.[0])
	let latestTrackDate = $derived(tracks[0]?.created_at)
	let isSignedIn = $derived(!!appState.user)
	let canEdit = $derived(isSignedIn && appState.channels?.includes(channel?.id))

	function openAddTrackModal() {
		appState.modal_track_add = {}
	}
</script>

<svelte:head>
	<title>{m.channel_page_title({name: channel?.name || m.channel_page_fallback()})}</title>
</svelte:head>

{#if channelQuery.isLoading}
	<p style="padding: 1rem;">Loading...</p>
{:else if channelQuery.isError}
	<p style="padding: 1rem; color: var(--red);">
		{channelsCollection.utils.lastError?.message || 'Error loading channel'}
	</p>
{:else if !channel}
	<p style="padding: 1rem;">Channel not found</p>
{:else}
	<article>
		<header>
			<ChannelHero {channel} />
			<div>
				<menu>
					<ButtonPlay {channel} label={m.button_play_label()} />
					<ButtonFollow {channel} />
				</menu>
				<h1>
					{channel.name}

					{#if channel.longitude && channel.latitude}
						<a
							href={`/?display=map&slug=${channel.slug}&longitude=${channel.longitude}&latitude=${channel.latitude}&zoom=15`}
						>
							<Icon icon="map" />
						</a>
					{/if}
				</h1>
				<p><LinkEntities slug={channel.slug} text={channel.description} /></p>
				{#if channel.url}
					<p><a href={channel.url} target="_blank" rel="noopener">{channel.url}</a></p>
				{/if}
				<p>
					<small>
						{m.channel_stats_summary({
							since: relativeDateSolar(channel.created_at),
							updated: relativeDate(latestTrackDate || channel.updated_at),
							count: channel.track_count ?? 0
						})}
					</small>
				</p>
			</div>
		</header>

		<section>
			{#if tracks.length > 0}
				<Tracklist {tracks} {canEdit} grouped={true} virtual={false} />
			{:else if (channel.track_count ?? 0) > 0}
				<p style="margin-top:1rem; margin-left: 0.5rem;">{m.channel_loading_tracks()}</p>
			{:else if canEdit}
				<p style="margin-top:1rem; margin-left: 0.5rem;">
					No tracks yet.
					<button onclick={openAddTrackModal}>Add your first track</button>
				</p>
			{:else}
				<p style="margin-top:1rem; margin-left: 0.5rem;">No tracks yet</p>
			{/if}
		</section>
	</article>
{/if}

<style>
	article {
		margin-bottom: var(--player-compact-size);
	}

	header {
		overflow: hidden;
		margin-bottom: 1rem;

		menu {
			margin-top: 1rem;
			justify-content: center;

			@media (min-width: 520px) {
				justify-content: flex-start;
			}
		}

		@media (min-width: 520px) {
			display: grid;
			grid-template-columns: 250px 1fr;
			> *:not(figure) {
				grid-column: 2;
			}
		}
	}

	article header :global(figure) {
		margin: 0.5rem auto 0;
		min-width: 150px;
		max-width: 300px;

		@media (min-width: 520px) {
			margin: 0.5rem 1rem 0rem 0.5rem;
			max-width: 250px;
		}
	}

	section {
		clear: both;
	}

	h1,
	h1 ~ p {
		margin: 0 1.5rem;
		text-align: center;

		@media (min-width: 520px) {
			text-align: left;
			margin: 0;
		}
	}

	h1 {
		display: flex;
		padding-top: 1rem;
		font-size: var(--font-9);
		gap: 0.5rem;
		align-items: center;
		place-content: center;

		@media (min-width: 520px) {
			place-content: flex-start;
		}
	}

	h1 + p {
		font-size: var(--font-7);
		line-height: 1.3;
		/* max-width: 80ch; */
	}

	small {
		font-size: var(--font-5);
	}
</style>
