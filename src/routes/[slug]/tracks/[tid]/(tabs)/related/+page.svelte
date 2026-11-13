<script>
	import {getTrackDetailCtx} from '#lib/contexts.js'
	import {appShortName} from '#lib/config.js'
	import {tracksCollection} from '#lib/collections/tracks.js'
	import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
	import {eq} from '@tanstack/db'
	import TrackCard from '#lib/components/track-card.svelte'
	import ChannelMicroCard from '#lib/components/channel-micro-card.svelte'
	import * as m from '#lib/paraglide/messages.js'

	const detail = getTrackDetailCtx()
	const track = $derived(detail.track)
	const trackMediaId = $derived(detail.trackMediaId)
	const trackProvider = $derived(detail.trackProvider)

	// Same media across channels. The collection fetches it by media_id itself.
	const relatedQuery = useLiveQuery((q) =>
		q.from({t: tracksCollection}).where(({t}) => eq(t.media_id, trackMediaId || ''))
	)
	const relatedTracks = $derived(
		(relatedQuery.data ?? []).filter(
			(t) => t.id !== track?.id && (t.provider ?? null) === trackProvider
		)
	)
</script>

<p>{m.track_related_heading()}</p>

{#if relatedTracks.length > 0}
	<ul class="list">
		{#each relatedTracks as track (track.id)}
			<li class="track-with-channel">
				<TrackCard {track} />
				<ChannelMicroCard slug={track.slug} />
			</li>
		{/each}
	</ul>
{:else}
	<p>{m.track_related_empty({appShortName})}</p>
{/if}

<style>
	.track-with-channel {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--space-1);
		padding-inline: 0.5rem;
	}

	.track-with-channel :global(article) {
		flex: 1;
		min-width: 0;
	}

	.track-with-channel :global(.card) {
		padding-inline-start: 0;
	}
</style>
