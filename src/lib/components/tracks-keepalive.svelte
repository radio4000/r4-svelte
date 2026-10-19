<script lang="ts">
	import {createLiveQueryCollection, eq, inArray} from '@tanstack/db'
	import {tracksCollection} from '#lib/collections/tracks.js'
	import {logger} from '#lib/logger.js'

	const log = logger.ns('keepalive').seal()

	// Holds tracks resident in the on-demand collection while mounted — without a
	// subscriber owning them, rows get evicted, which GCs the playing track and tears
	// down the media element. Caller keys this per deck.
	// A pin needs the subscription, never the rows — so it owns the live query
	// directly; useLiveQuery would copy every matched row into component state on
	// each change.
	// `slugs` is the cheap pin (one comparison per row); `ids` is O(ids × rows) —
	// pass only small sets. See queuePinTargets().
	let {ids = [], slugs = []}: {ids?: string[]; slugs?: string[]} = $props()

	const slugKey = $derived(slugs.join(','))
	const idKey = $derived(ids.join(','))

	/** Own a subset until the effect tears down. Ownership follows the subscription,
	 *  not the query — an unsubscribed live query lets its rows get collected. */
	function pin(query: Parameters<typeof createLiveQueryCollection>[0]['query']) {
		const collection = createLiveQueryCollection({query, startSync: true})
		const subscription = collection.subscribeChanges(() => {})
		collection.preload().catch(log.error)
		return () => {
			subscription.unsubscribe()
			collection.cleanup()
		}
	}

	$effect(() => {
		if (!slugKey) return
		const list = slugKey.split(',')
		return pin((q) =>
			q
				.from({t: tracksCollection})
				.where(({t}) => (list.length === 1 ? eq(t.slug, list[0]) : inArray(t.slug, list)))
		)
	})

	$effect(() => {
		if (!idKey) return
		const list = idKey.split(',')
		return pin((q) => q.from({t: tracksCollection}).where(({t}) => inArray(t.id, list)))
	})
</script>
