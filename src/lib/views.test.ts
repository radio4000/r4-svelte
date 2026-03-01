import {describe, test, expect} from 'vitest'
import {parseSearchQueryToView, viewToQuery, parseView, serializeView, normalizeView, viewKey} from './views'
import type {View} from './views'

describe('parseSearchQueryToView', () => {
	test('channels', () => {
		expect(parseSearchQueryToView('@alice @bob')).toEqual({channels: ['alice', 'bob']})
	})
	test('tags', () => {
		expect(parseSearchQueryToView('#jazz #dub')).toEqual({tags: ['jazz', 'dub']})
	})
	test('search', () => {
		expect(parseSearchQueryToView('miles davis')).toEqual({search: 'miles davis'})
	})
	test('mixed', () => {
		expect(parseSearchQueryToView('@ko002 #jazz miles davis')).toEqual({
			channels: ['ko002'],
			tags: ['jazz'],
			search: 'miles davis'
		})
	})
	test('deduplicates channels and tags', () => {
		expect(parseSearchQueryToView('@a @a #x #x')).toEqual({channels: ['a'], tags: ['x']})
	})
	test('empty input', () => {
		expect(parseSearchQueryToView('')).toEqual({})
	})
	test('bare @ and # are ignored', () => {
		expect(parseSearchQueryToView('@ #')).toEqual({})
	})
})

describe('viewToQuery', () => {
	test('channels + tags + search', () => {
		expect(viewToQuery({channels: ['alice'], tags: ['jazz'], search: 'hello'})).toBe('@alice #jazz hello')
	})
	test('empty view', () => {
		expect(viewToQuery({})).toBe('')
	})
})

describe('round-trip: parseSearchQueryToView ↔ viewToQuery', () => {
	const cases = [
		'@alice #jazz',
		'@ko002 #jazz miles davis',
		'@alice @bob',
		'#jazz #dub',
		'miles davis',
		'@ko002',
		'#ambient'
	]
	for (const query of cases) {
		test(`"${query}"`, () => {
			const view = parseSearchQueryToView(query)
			const serialized = viewToQuery(view)
			const reparsed = parseSearchQueryToView(serialized)
			expect(reparsed).toEqual(view)
		})
	}
})

describe('round-trip: parseView ↔ serializeView', () => {
	const views: View[] = [
		{channels: ['ko002'], tags: ['jazz'], order: 'created', direction: 'asc', limit: 50},
		{tags: ['ambient', 'dub'], tagsMode: 'all'},
		{search: 'miles davis', order: 'name', direction: 'desc'},
		{channels: ['alice', 'bob'], order: 'shuffle'},
		{limit: 100},
		{}
	]
	for (const view of views) {
		test(JSON.stringify(view), () => {
			const params = serializeView(view)
			const reparsed = parseView(params)
			const normalized = normalizeView(view)
			const rNormalized = normalizeView(reparsed)
			expect(rNormalized).toEqual(normalized)
		})
	}
})

describe('viewKey', () => {
	test('equivalent views produce same key', () => {
		const a: View = {channels: ['ko002'], tags: ['jazz']}
		const b: View = {channels: ['ko002'], tags: ['jazz'], tagsMode: undefined}
		expect(viewKey(a)).toBe(viewKey(b))
	})
	test('different views produce different keys', () => {
		expect(viewKey({channels: ['a']})).not.toBe(viewKey({channels: ['b']}))
	})
	test('empty view', () => {
		expect(viewKey({})).toBe('')
	})
})
