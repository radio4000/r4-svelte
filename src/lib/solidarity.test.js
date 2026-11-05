import {describe, expect, test} from 'vitest'
import {isSolidarityDay} from './solidarity.js'

describe('isSolidarityDay', () => {
	test('covers the whole local day of 5 November 2026', () => {
		expect(isSolidarityDay(new Date(2026, 10, 5, 0, 0))).toBe(true)
		expect(isSolidarityDay(new Date(2026, 10, 5, 23, 59))).toBe(true)
	})
	test('ends at local midnight', () => {
		expect(isSolidarityDay(new Date(2026, 10, 4, 23, 59))).toBe(false)
		expect(isSolidarityDay(new Date(2026, 10, 6, 0, 0))).toBe(false)
		expect(isSolidarityDay(new Date(2027, 10, 5, 12, 0))).toBe(false)
	})
})
