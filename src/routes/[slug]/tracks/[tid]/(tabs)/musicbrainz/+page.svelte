<script>
	import {getTrackDetailCtx} from '$lib/contexts'
	import TrackMetaMusicbrainz from '$lib/components/track-meta-musicbrainz.svelte'

	const detail = getTrackDetailCtx()
	const track = $derived(detail.track)
	const meta = $derived(detail.meta)
	const hasMusicbrainzInfo = $derived(detail.hasMusicbrainzInfo)
	const musicbrainzData = $derived(meta?.musicbrainz_data)
</script>

{#if hasMusicbrainzInfo}
	<TrackMetaMusicbrainz data={musicbrainzData} {track} />
{:else}
	<p>No MusicBrainz information.</p>
{/if}
