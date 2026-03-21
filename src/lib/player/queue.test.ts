import {describe, expect, it} from 'vitest'
import {
	queueNext,
	queuePrev,
	queueInsertManyAfter,
	queueRemove,
	queueShuffleKeepCurrent,
	queueRotate,
	queueUnique
} from './queue'

const queue = ['a', 'b', 'c', 'd', 'e']

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

describe('queue removal', () => {
	it('queueRemove removes single item', () => {
		expect(queueRemove(queue, 'c')).toEqual(['a', 'b', 'd', 'e'])
		expect(queueRemove(queue, 'x')).toEqual(queue)
	})
})

describe('queue shuffle', () => {
	it('queueShuffleKeepCurrent keeps current at front', () => {
		const shuffled = queueShuffleKeepCurrent(queue, 'c')
		expect(shuffled[0]).toBe('c')
		expect(shuffled.length).toBe(queue.length)
	})
})

describe('queue manipulation', () => {
	it('queueRotate moves items before current to end', () => {
		expect(queueRotate(queue, 'c')).toEqual(['c', 'd', 'e', 'a', 'b'])
		expect(queueRotate(queue, 'a')).toEqual(queue)
		expect(queueRotate(queue, 'x')).toEqual(queue)
	})

	it('queueUnique removes duplicates', () => {
		expect(queueUnique(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c'])
	})
})
