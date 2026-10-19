import {describe, expect, test} from 'vitest'
import {fuzzySearch, getPlayCountThreshold} from '#lib/utils.js'

const channels = [
	{name: 'Radio Alhara', slug: 'radio-alhara', description: 'Sounds from Palestine'},
	{name: 'Radio 80000', slug: 'radio-80000', description: 'Community radio from Munich'},
	{name: 'Kiosk Radio', slug: 'kiosk-radio', description: 'Broadcasting from Brussels'}
]

describe('fuzzySearch', () => {
	test('matches objects across keys and tolerates typos', () => {
		expect(fuzzySearch('alhara', channels, ['name', 'slug', 'description'])).toEqual([channels[0]])
		expect(fuzzySearch('palestin', channels, ['name', 'slug', 'description'])).toEqual([
			channels[0]
		])
	})

	test('preserves all items for an empty query and respects limits', () => {
		expect(fuzzySearch(' ', channels, ['name'])).toBe(channels)
		expect(fuzzySearch('radio', channels, ['name'], {limit: 2})).toHaveLength(2)
	})
})

describe('getPlayCountThreshold', () => {
	test('returns full duration for tracks under 2 minutes', () => {
		expect(getPlayCountThreshold(90)).toBe(90)
		expect(getPlayCountThreshold(119)).toBe(119)
	})

	test('returns half duration for tracks 2 minutes or longer', () => {
		expect(getPlayCountThreshold(120)).toBe(60)
		expect(getPlayCountThreshold(300)).toBe(150)
		expect(getPlayCountThreshold(600)).toBe(240)
	})

	test('caps threshold at 4 minutes', () => {
		expect(getPlayCountThreshold(800)).toBe(240)
		expect(getPlayCountThreshold(1000)).toBe(240)
	})

	test('falls back to 4 minutes when duration is unknown', () => {
		expect(getPlayCountThreshold()).toBe(240)
		expect(getPlayCountThreshold(null)).toBe(240)
		expect(getPlayCountThreshold(0)).toBe(240)
	})
})
