<script>
	import {getTrackDetailCtx} from '$lib/contexts'
	import TrackRelated from '$lib/components/track-related.svelte'

	const detail = getTrackDetailCtx()
	const track = $derived(detail.track)
	const relatedTracks = $derived(detail.relatedTracks)
</script>

{#if relatedTracks.length > 0}
	<TrackRelated {track} />
{:else}
	<p>No related information.</p>
{/if}
