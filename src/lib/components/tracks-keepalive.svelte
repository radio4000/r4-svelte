<script lang="ts">
	import {eq, inArray} from '@tanstack/db'
	import {tracksCollection} from '#lib/collections/tracks.js'
	import {holdPin} from '#lib/player/channel-tracks.js'

	// Holds tracks resident in the on-demand collection while mounted — without a
	// subscriber owning them, rows get evicted, which GCs the playing track and tears
	// down the media element. Caller keys this per deck.
	// A pin needs the subscription, never the rows — so it subscribes to the collection
	// with a filter, which loads and owns that subset. A live query would also build a
	// pipeline and a second copy of every matched row (~50ms per play on a big channel).
	// `slugs` is the cheap pin (one comparison per row); `ids` is O(ids × rows) —
	// pass only small sets. See queuePinTargets().
	let {ids = [], slugs = []}: {ids?: string[]; slugs?: string[]} = $props()

	const slugKey = $derived(slugs.join(','))
	const idKey = $derived(ids.join(','))

	type Where = NonNullable<Parameters<typeof tracksCollection.subscribeChanges>[1]>['where']

	/** Own a subset until the effect tears down. Ownership follows the subscription:
	 *  includeInitialState asks the collection to load the subset, unsubscribe releases it. */
	function pin(where: Where) {
		const subscription = tracksCollection.subscribeChanges(() => {}, {
			where,
			includeInitialState: true
		})
		return () => subscription.unsubscribe()
	}

	$effect(() => {
		if (!slugKey) return
		const list = slugKey.split(',')
		if (list.length > 1) return pin((t) => inArray(t.slug, list))
		// One channel is on loadChannelTracks' key, so this pin owns the rows from the moment
		// it subscribes: take them over from that door's lease (channel-tracks.ts).
		return both(
			pin((t) => eq(t.slug, list[0])),
			holdPin({slug: list[0]})
		)
	})

	$effect(() => {
		if (!idKey) return
		const list = idKey.split(',')
		if (list.length > 1) return pin((t) => inArray(t.id, list))
		// One track (the current-track pin) is on loadTrack's key: same hand-over
		return both(
			pin((t) => inArray(t.id, list)),
			holdPin({id: list[0]})
		)
	})

	/** Teardown for a pin and its hold together. */
	function both(unpin: () => void, release: () => void) {
		return () => {
			release()
			unpin()
		}
	}
</script>
