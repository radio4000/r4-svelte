<script>
	import {getTrackDetailCtx} from '$lib/contexts'
	import TrackRelated from '$lib/components/track-related.svelte'

	const detail = getTrackDetailCtx()
	const relatedTracks = $derived(detail.relatedTracks)
</script>

{#if relatedTracks.length > 0}
	<TrackRelated {relatedTracks} />
{:else}
	<p>No related information.</p>
{/if}
