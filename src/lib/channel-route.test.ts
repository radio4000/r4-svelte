import {describe, expect, test} from 'vitest'
import type {Channel} from '#lib/types.js'
import {pickRouteChannel, updateStableChannelId} from './channel-route'

function makeChannel(id: string, slug: string, name: string): Channel {
	return {
		id,
		slug,
		name,
		description: '',
		image: null,
		followers: [],
		favorites: [],
		firebase_id: null,
		latitude: null,
		longitude: null,
		track_count: 0,
		latest_track_at: null,
		user_id: null,
		created_at: '',
		updated_at: '',
		url: ''
	} as unknown as Channel
}

const alpha = makeChannel('1', 'alpha', 'Alpha')
const beta = makeChannel('2', 'beta', 'Beta')

describe('channel route helpers', () => {
	test('keeps stable channel id scoped to the current route slug', () => {
		expect(updateStableChannelId('alpha', '', '', alpha)).toEqual({
			channelId: '1',
			channelIdSourceSlug: 'alpha'
		})

		expect(updateStableChannelId('beta', '1', 'alpha', undefined)).toEqual({
			channelId: '1',
			channelIdSourceSlug: 'alpha'
		})

		expect(updateStableChannelId('beta', '1', 'alpha', beta)).toEqual({
			channelId: '2',
			channelIdSourceSlug: 'beta'
		})
	})

	test('prefers the current-route slug match over stale slug data', () => {
		const staleSlugChannel = alpha
		const resolvedById = beta

		expect(pickRouteChannel('beta', staleSlugChannel, resolvedById)).toEqual(resolvedById)
		expect(pickRouteChannel('beta', beta, resolvedById)).toEqual(beta)
		expect(pickRouteChannel('beta', staleSlugChannel, undefined)).toEqual(staleSlugChannel)
	})

	test('ignores an id-less ghost channel from a transitioning live query', () => {
		const ghost = {} as Channel
		expect(pickRouteChannel('beta', undefined, ghost)).toBeUndefined()
		expect(pickRouteChannel('beta', ghost, undefined)).toBeUndefined()
	})
})
