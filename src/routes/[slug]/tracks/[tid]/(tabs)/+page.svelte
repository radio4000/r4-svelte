<script>
	import {getTrackDetailCtx} from '$lib/contexts'
	import TrackMetaR5 from '$lib/components/track-meta-r5.svelte'

	const detail = getTrackDetailCtx()
	const track = $derived(detail.track)
	const channel = $derived(detail.channel)
</script>

<TrackMetaR5 data={track} {channel} />
