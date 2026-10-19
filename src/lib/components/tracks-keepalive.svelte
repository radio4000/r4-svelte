<script lang="ts">
	import {eq, inArray} from '@tanstack/db'
	import {tracksCollection} from '#lib/collections/tracks.js'

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
		return pin((t) => (list.length === 1 ? eq(t.slug, list[0]) : inArray(t.slug, list)))
	})

	$effect(() => {
		if (!idKey) return
		const list = idKey.split(',')
		return pin((t) => inArray(t.id, list))
	})
</script>
