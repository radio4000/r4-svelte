<script>
	import {getTrackDetailCtx} from '$lib/contexts'
	import TrackMetaDiscogs from '$lib/components/track-meta-discogs.svelte'

	const detail = getTrackDetailCtx()
	const track = $derived(detail.track)
	const channel = $derived(detail.channel)
	const canEdit = $derived(detail.canEdit)
	const meta = $derived(detail.meta)
	const tracks = $derived(detail.tracks)
	const hasDiscogsInfo = $derived(detail.hasDiscogsInfo)
</script>

{#if hasDiscogsInfo}
	<TrackMetaDiscogs data={meta?.discogs_data} {track} {tracks} {channel} {canEdit} />
{:else}
	<p>No Discogs information.</p>
{/if}
