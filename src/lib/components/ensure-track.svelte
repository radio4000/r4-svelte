<script>
	import {tracksCollection} from '$lib/tanstack/collections'
	import {sdk} from '@radio4000/sdk'
	import * as m from '$lib/paraglide/messages'

	let {tid} = $props()

	let fetchedTrack = $state(/** @type {import('$lib/types').Track | null} */ (null))

	// Get from collection or use fetched track
	const track = $derived(tracksCollection.state.get(tid) ?? fetchedTrack)

	// Fetch track if not in collection
	$effect(() => {
		fetchedTrack = null
		if (!tid) return
		if (tracksCollection.state.has(tid)) return
		sdk.tracks
			.readTrack(tid)
			.then(({data}) => {
				if (data) {
					tracksCollection.utils.writeUpsert(data)
					fetchedTrack = data
				}
			})
			.catch(() => {})
	})
</script>

{#if track}
	{track.title}
{:else}
	{m.common_loading()}
{/if}
