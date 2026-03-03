<script>
	import {getTrackDetailCtx} from '$lib/contexts'
	import {tracksCollection} from '$lib/collections/tracks'
	import {queryClient} from '$lib/collections/query-client'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {eq} from '@tanstack/db'
	import {sdk} from '@radio4000/sdk'
	import {parseUrl} from 'media-now'
	import TrackCard from '$lib/components/track-card.svelte'

	const detail = getTrackDetailCtx()
	const track = $derived(detail.track)
	const trackMediaId = $derived(detail.trackMediaId)
	const trackProvider = $derived(detail.trackProvider)

	// Fetch all tracks with the same media_id across channels, cached by media_id
	$effect(() => {
		const mediaId = trackMediaId
		if (!mediaId) return
		queryClient.fetchQuery({
			queryKey: ['tracks', 'media_id', mediaId],
			staleTime: 0, //5 * 60 * 1000, // 5 mins
			queryFn: async () => {
				const {data: tracks, error} = await sdk.supabase.from('channel_tracks').select('*').eq('media_id', mediaId)
				if (error) throw error
				tracksCollection.utils.writeBatch(() => {
					for (const t of tracks) tracksCollection.utils.writeUpsert(t)
				})
				return tracks
			}
		})
	})

	// Reactive cross-channel results from the collection
	const relatedQuery = useLiveQuery((q) =>
		q.from({t: tracksCollection}).where(({t}) => eq(t.media_id, trackMediaId || ''))
	)
	const relatedTracks = $derived(
		(relatedQuery.data ?? []).filter((t) => t.id !== track?.id && (t.provider ?? null) === trackProvider)
	)
</script>

<p>Other tracks on Radio4000 sharing the same media:</p>

{#if relatedTracks.length > 0}
	<ul class="list">
		{#each relatedTracks as track (track.id)}
			<li><TrackCard {track} showSlug={true} /></li>
		{/each}
	</ul>
{:else}
	<p>No related information.</p>
{/if}
