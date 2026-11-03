import {describe, expect, test} from 'vitest'
import {createCollection, createLiveQueryCollection, gte} from '@tanstack/db'
import {rankShuffled} from './channels.js'
import type {Channel} from '#lib/types.js'

const ch = (id: string) => ({id, slug: id, track_count: 20}) as Channel

/** Same clauses as the shuffle branch in channels.svelte. */
function shuffledListing(rows: Channel[], limit: number) {
	const channels = createCollection<Channel, string>({
		id: `channels-${Math.random()}`,
		getKey: (c) => c.id,
		sync: {
			sync: ({begin, write, commit, markReady}) => {
				begin()
				for (const value of rows) write({type: 'insert', value})
				commit()
				markReady()
			}
		}
	})
	return createLiveQueryCollection((q) =>
		q
			.from({ch: channels})
			.where(({ch}) => gte(ch.shuffle, 0))
			.orderBy(({ch}) => ch.shuffle, 'asc')
			.limit(limit)
	)
}

describe('explore shuffle with follows in the collection', () => {
	test('lists the server-ranked channels, not the follows loaded first', async () => {
		const follows = ['f1', 'f2', 'f3', 'f4'].map(ch)
		const browse = rankShuffled(['b1', 'b2', 'b3', 'b4'].map(ch))
		// Follows are inserted first, as when a signed-in user's follows hydrate before explore.
		const listing = shuffledListing([...follows, ...browse], 3)
		await listing.preload()
		expect(listing.toArray.map((c) => c.id)).toEqual(['b1', 'b2', 'b3'])
	})

	test('ranks continue after the cached head when a page grows', () => {
		const next = rankShuffled([ch('x'), ch('y')], 12)
		expect(next.map((c) => c.shuffle)).toEqual([12, 13])
	})
})
