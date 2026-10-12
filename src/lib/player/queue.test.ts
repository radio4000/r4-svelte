import {describe, expect, it} from 'vitest'
import {queueNext, queuePrev, queueInsertManyAfter, getActiveQueue} from './queue'

const queue = ['a', 'b', 'c', 'd', 'e']

describe('filtered queue playback', () => {
	const deck = {
		shuffle: false,
		playlist_tracks: queue,
		playlist_tracks_shuffled: ['e', 'c', 'a', 'd', 'b'],
		playlist_tracks_filtered: ['a', 'c', 'e'] as string[] | undefined
	}

	it('next and previous stay within results while keeping the full queue intact', () => {
		const active = getActiveQueue(deck)
		expect(queueNext(active, 'a')).toBe('c')
		expect(queuePrev(active, 'e')).toBe('c')
		expect(queueNext(active, 'e')).toBeNull()
		expect(deck.playlist_tracks).toEqual(queue)
	})

	it('preserves shuffled order and ignores results removed from the queue', () => {
		expect(
			getActiveQueue({...deck, shuffle: true, playlist_tracks_filtered: ['a', 'e', 'missing']})
		).toEqual(['e', 'a'])
	})

	it('keeps the current track so next moves on to the nearest match', () => {
		const active = getActiveQueue({...deck, playlist_track: 'b'})
		expect(active).toEqual(['a', 'b', 'c', 'e'])
		expect(queueNext(active, 'b')).toBe('c')
	})

	it('restores the full queue when the restriction is cleared', () => {
		expect(getActiveQueue({...deck, playlist_tracks_filtered: undefined})).toBe(queue)
		expect(getActiveQueue({...deck, playlist_tracks_filtered: []})).toEqual([])
	})
})

describe('queue navigation', () => {
	it('queueNext returns next item', () => {
		expect(queueNext(queue, 'b')).toBe('c')
		expect(queueNext(queue, 'e')).toBeNull()
		expect(queueNext(queue, 'x')).toBeNull()
	})

	it('queuePrev returns previous item', () => {
		expect(queuePrev(queue, 'c')).toBe('b')
		expect(queuePrev(queue, 'a')).toBeNull()
		expect(queuePrev(queue, 'x')).toBeNull()
	})
})

describe('queue insertion', () => {
	it('queueInsertManyAfter inserts multiple items', () => {
		expect(queueInsertManyAfter(queue, 'b', ['x', 'y'])).toEqual([
			'a',
			'b',
			'x',
			'y',
			'c',
			'd',
			'e'
		])
		expect(queueInsertManyAfter(queue, 'missing', ['x'])).toEqual(['a', 'b', 'c', 'd', 'e', 'x'])
	})
})
