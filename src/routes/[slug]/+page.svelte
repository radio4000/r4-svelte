<script>
	import ButtonFollow from '$lib/components/button-follow.svelte'
	import ButtonPlay from '$lib/components/button-play.svelte'
	import ChannelHero from '$lib/components/channel-hero.svelte'
	import Icon from '$lib/components/icon.svelte'
	import LinkEntities from '$lib/components/link-entities.svelte'
	import Tracklist from '$lib/components/tracklist.svelte'
	import {relativeDate, relativeDateSolar} from '$lib/dates'
	import {useAppState} from '$lib/app-state.svelte'
	import {channelsCollection, tracksCollection, fetchChannelTracks} from '$lib/collections'
	import {useLiveQuery} from '$lib/tanstack-svelte-db-useLiveQuery-patched.svelte'
	import {eq} from '@tanstack/svelte-db'

	let {data} = $props()

	const appState = useAppState()
	const slug = $derived(data.slug)

	// Get channel from collection using live query
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

	// Get tracks from collection using live query
	const tracksQuery = useLiveQuery(
		(q) => {
			if (!slug) return undefined
			return q
				.from({track: tracksCollection})
				.where(({track}) => eq(track.channel_slug, slug))
				.orderBy(({track}) => track.created_at, 'desc')
		},
		[slug]
	)

	const tracks = $derived(tracksQuery.data || [])

	// Fetch tracks if not in collection yet
	$effect(() => {
		if (slug && channel && tracks.length === 0 && !tracksQuery.isLoading) {
			fetchChannelTracks(slug).catch((err) => {
				console.error('Failed to fetch tracks:', err)
			})
		}
	})

	const isSignedIn = $derived(!!appState?.user)
	const canEdit = $derived(isSignedIn && appState?.channels?.includes(channel?.id))

	let latestTrackDate = $derived(tracks[0]?.created_at)
</script>

<svelte:head>
	<title>{channel?.name || 'Channel'} - R5</title>
</svelte:head>

{#if channelQuery.isLoading}
	<p style="margin: 2rem 0.5rem;">Loading channel...</p>
{:else if channel}
	<article>
		<header>
			<ChannelHero {channel} />
			<div>
				<menu>
					<ButtonPlay {channel} label="Play" />
					<ButtonFollow {channel} />
					<a href="/{channel.slug}/tags" class="btn">Tags</a>
					{#if canEdit}
						<a href="/{channel.slug}/edit" class="btn">Edit</a>
					{/if}
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
						Broadcasting since {relativeDateSolar(channel.created_at)}. Updated {relativeDate(
							latestTrackDate || channel.updated_at
						)}. {channel.track_count} tracks
					</small>
				</p>
			</div>
		</header>

		<section>
			{#if tracks.length > 0}
				<!-- <CoverFlip tracks={tracks} /> -->
				<Tracklist {tracks} grouped={1} />
			{:else if tracksQuery.isLoading}
				<p style="margin-top:1rem; margin-left: 0.5rem;">Loading tracks…</p>
			{:else}
				<p style="margin-top:1rem; margin-left: 0.5rem;">No tracks yet</p>
			{/if}
		</section>
	</article>
{:else}
	<p style="margin: 2rem 0.5rem;">Channel not found</p>
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

			:global(a, button) {
				min-height: 2.5rem;
				padding: 0.5rem 1rem;
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
