<script>
	import {getTracksCollection} from '$lib/collections'
	import {r5} from '$lib/r5'

	const {tid} = $props()
	const tracksCollection = getTracksCollection()

	let track = $state()

	$effect(async () => {
		if (!tid) return

		// Try to find track in collection
		track = tracksCollection.toArray.find((t) => t.id === tid)

		// If not found, pull from remote
		if (!track) {
			await r5.tracks.pull({id: tid})
			track = tracksCollection.toArray.find((t) => t.id === tid)
		}
	})
</script>

{#if track}
	{track.title}
{:else}
	MISSING TRACK
{/if}

<!-- {#await promise}
	loading track
{:then res}
	{@const track = res.rows[0]}
{:catch err}
	nop {err.message}
{/await} -->
