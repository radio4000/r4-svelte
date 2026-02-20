<script>
	import {getTrackDetailCtx} from '$lib/contexts'
	import TrackMetaYoutube from '$lib/components/track-meta-youtube.svelte'

	const detail = getTrackDetailCtx()
	const meta = $derived(detail.meta)
	const hasYoutubeInfo = $derived(detail.hasYoutubeInfo)
	const youtubeData = $derived(meta?.youtube_data)
</script>

{#if hasYoutubeInfo}
	<TrackMetaYoutube data={youtubeData} />
{:else}
	<p>No YouTube information.</p>
{/if}
