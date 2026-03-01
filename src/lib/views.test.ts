import {describe, test, expect} from 'vitest'
import {parseQuery, serializeQuery, parseView, serializeView, normalizeView, viewKey, viewLabel} from './views'
import type {View} from './views'

describe('parseQuery', () => {
	test('channels', () => {
		expect(parseQuery('@alice @bob')).toEqual({channels: ['alice', 'bob']})
	})
	test('tags', () => {
		expect(parseQuery('#jazz #dub')).toEqual({tags: ['jazz', 'dub']})
	})
	test('search', () => {
		expect(parseQuery('miles davis')).toEqual({search: 'miles davis'})
	})
	test('mixed', () => {
		expect(parseQuery('@ko002 #jazz miles davis')).toEqual({
			channels: ['ko002'],
			tags: ['jazz'],
			search: 'miles davis'
		})
	})
	test('deduplicates channels and tags', () => {
		expect(parseQuery('@a @a #x #x')).toEqual({channels: ['a'], tags: ['x']})
	})
	test('empty input', () => {
		expect(parseQuery('')).toEqual({})
	})
	test('bare @ and # are ignored', () => {
		expect(parseQuery('@ #')).toEqual({})
	})
})

describe('serializeQuery', () => {
	test('channels + tags + search', () => {
		expect(serializeQuery({channels: ['alice'], tags: ['jazz'], search: 'hello'})).toBe('@alice #jazz hello')
	})
	test('empty query', () => {
		expect(serializeQuery({})).toBe('')
	})
})

describe('round-trip: parseQuery ↔ serializeQuery', () => {
	const cases = [
		'@alice #jazz',
		'@ko002 #jazz miles davis',
		'@alice @bob',
		'#jazz #dub',
		'miles davis',
		'@ko002',
		'#ambient'
	]
	for (const input of cases) {
		test(`"${input}"`, () => {
			const query = parseQuery(input)
			const serialized = serializeQuery(query)
			const reparsed = parseQuery(serialized)
			expect(reparsed).toEqual(query)
		})
	}
})

describe('parseView', () => {
	test('single channel', () => {
		expect(parseView('@ko002')).toEqual({queries: [{channels: ['ko002']}]})
	})
	test('channel + tag + search with options', () => {
		expect(parseView('@ko002 #jazz miles davis?order=created&direction=asc&limit=50')).toEqual({
			queries: [{channels: ['ko002'], tags: ['jazz'], search: 'miles davis'}],
			order: 'created',
			direction: 'asc',
			limit: 50
		})
	})
	test('multiple queries', () => {
		expect(parseView('@alice #jazz;@bob #techno;@coco miles davis')).toEqual({
			queries: [
				{channels: ['alice'], tags: ['jazz']},
				{channels: ['bob'], tags: ['techno']},
				{channels: ['coco'], search: 'miles davis'}
			]
		})
	})
	test('exclude option', () => {
		expect(parseView('@ko002?exclude=uuid-1,uuid-2')).toEqual({
			queries: [{channels: ['ko002']}],
			exclude: ['uuid-1', 'uuid-2']
		})
	})
	test('tagsMode=all applies to queries with tags', () => {
		expect(parseView('#jazz #dub?tagsMode=all')).toEqual({
			queries: [{tags: ['jazz', 'dub'], tagsMode: 'all'}]
		})
	})
	test('empty input gives one empty query', () => {
		expect(parseView('')).toEqual({queries: [{}]})
	})
	test('shuffle with limit', () => {
		expect(parseView('?order=shuffle&limit=50')).toEqual({
			queries: [{}],
			order: 'shuffle',
			limit: 50
		})
	})
	test('strips r4:// prefix', () => {
		expect(parseView('r4://@alice #jazz;@bob #techno?order=shuffle')).toEqual({
			queries: [
				{channels: ['alice'], tags: ['jazz']},
				{channels: ['bob'], tags: ['techno']}
			],
			order: 'shuffle'
		})
	})
})

describe('serializeView', () => {
	test('single query', () => {
		expect(serializeView({queries: [{channels: ['ko002']}]})).toBe('@ko002')
	})
	test('multiple queries with options', () => {
		const view: View = {
			queries: [{channels: ['alice'], tags: ['jazz']}, {channels: ['bob']}],
			order: 'shuffle',
			limit: 100
		}
		expect(serializeView(view)).toBe('@alice #jazz;@bob?order=shuffle&limit=100')
	})
	test('exclude', () => {
		const view: View = {
			queries: [{channels: ['ko002']}],
			exclude: ['uuid-1', 'uuid-2']
		}
		expect(serializeView(view)).toBe('@ko002?exclude=uuid-1,uuid-2')
	})
})

describe('round-trip: parseView ↔ serializeView', () => {
	const cases = [
		'@ko002',
		'@ko002 #jazz',
		'@alice #jazz;@bob #techno',
		'@alice;@bob;@coco?order=shuffle&limit=100',
		'@ko002?exclude=uuid-1,uuid-2'
	]
	for (const input of cases) {
		test(`"${input}"`, () => {
			const view = parseView(input)
			const serialized = serializeView(view)
			const reparsed = parseView(serialized)
			expect(reparsed).toEqual(view)
		})
	}
})

describe('normalizeView', () => {
	test('strips empty fields', () => {
		const view: View = {queries: [{channels: ['ko002'], tags: []}]}
		const result = normalizeView(view)
		expect(result).toBeDefined()
	})
	test('undefined input returns undefined', () => {
		expect(normalizeView(undefined)).toBeUndefined()
	})
})

describe('viewLabel', () => {
	test('single query', () => {
		const view: View = {queries: [{channels: ['ko002'], tags: ['jazz']}]}
		expect(viewLabel(view)).toBe('@ko002 #jazz')
	})
	test('multi-query includes all queries', () => {
		const view: View = {queries: [{channels: ['alice']}, {channels: ['bob']}]}
		expect(viewLabel(view)).toBe('@alice; @bob')
	})
	test('empty queries', () => {
		const view: View = {queries: [{}]}
		expect(viewLabel(view)).toBe('')
	})
})

describe('viewKey', () => {
	test('equivalent views produce same key', () => {
		const a: View = {queries: [{channels: ['ko002'], tags: ['jazz']}]}
		const b: View = {queries: [{channels: ['ko002'], tags: ['jazz']}]}
		expect(viewKey(a)).toBe(viewKey(b))
	})
	test('different views produce different keys', () => {
		const a: View = {queries: [{channels: ['a']}]}
		const b: View = {queries: [{channels: ['b']}]}
		expect(viewKey(a)).not.toBe(viewKey(b))
	})
	test('empty view', () => {
		expect(viewKey({queries: [{}]})).toBe('')
	})
})
