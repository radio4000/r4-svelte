import {describe, test, expect} from 'vitest'
import {
	parseSegment,
	serializeSegment,
	parseParams,
	serializeParams,
	normalizeView,
	viewKey,
	parseUri,
	serializeUri
} from './views'
import type {View, CompositeView} from './views'

describe('parseSegment', () => {
	test('channels', () => {
		expect(parseSegment('@alice @bob')).toEqual({channels: ['alice', 'bob']})
	})
	test('tags', () => {
		expect(parseSegment('#jazz #dub')).toEqual({tags: ['jazz', 'dub']})
	})
	test('search', () => {
		expect(parseSegment('miles davis')).toEqual({search: 'miles davis'})
	})
	test('mixed', () => {
		expect(parseSegment('@ko002 #jazz miles davis')).toEqual({
			channels: ['ko002'],
			tags: ['jazz'],
			search: 'miles davis'
		})
	})
	test('deduplicates channels and tags', () => {
		expect(parseSegment('@a @a #x #x')).toEqual({channels: ['a'], tags: ['x']})
	})
	test('empty input', () => {
		expect(parseSegment('')).toEqual({})
	})
	test('bare @ and # are ignored', () => {
		expect(parseSegment('@ #')).toEqual({})
	})
})

describe('serializeSegment', () => {
	test('channels + tags + search', () => {
		expect(serializeSegment({channels: ['alice'], tags: ['jazz'], search: 'hello'})).toBe('@alice #jazz hello')
	})
	test('empty segment', () => {
		expect(serializeSegment({})).toBe('')
	})
})

describe('round-trip: parseSegment ↔ serializeSegment', () => {
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
			const segment = parseSegment(query)
			const serialized = serializeSegment(segment)
			const reparsed = parseSegment(serialized)
			expect(reparsed).toEqual(segment)
		})
	}
})

describe('round-trip: parseParams ↔ serializeParams', () => {
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
			const params = serializeParams(view)
			const reparsed = parseParams(params)
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

describe('parseUri', () => {
	test('single channel', () => {
		expect(parseUri('r4://@ko002')).toEqual({segments: [{channels: ['ko002']}]})
	})
	test('channel + tag + search with options', () => {
		expect(parseUri('r4://@ko002 #jazz miles davis?order=created&direction=asc&limit=50')).toEqual({
			segments: [{channels: ['ko002'], tags: ['jazz'], search: 'miles davis'}],
			order: 'created',
			direction: 'asc',
			limit: 50
		})
	})
	test('multiple segments', () => {
		expect(parseUri('r4://@alice #jazz;@bob #techno;@coco miles davis')).toEqual({
			segments: [
				{channels: ['alice'], tags: ['jazz']},
				{channels: ['bob'], tags: ['techno']},
				{channels: ['coco'], search: 'miles davis'}
			]
		})
	})
	test('exclude option', () => {
		expect(parseUri('r4://@ko002?exclude=uuid-1,uuid-2')).toEqual({
			segments: [{channels: ['ko002']}],
			exclude: ['uuid-1', 'uuid-2']
		})
	})
	test('tagsMode=all applies to segments with tags', () => {
		expect(parseUri('r4://#jazz #dub?tagsMode=all')).toEqual({
			segments: [{tags: ['jazz', 'dub'], tagsMode: 'all'}]
		})
	})
	test('empty URI gives one empty segment', () => {
		expect(parseUri('r4://')).toEqual({segments: [{}]})
	})
	test('shuffle with limit', () => {
		expect(parseUri('r4://?order=shuffle&limit=50')).toEqual({
			segments: [{}],
			order: 'shuffle',
			limit: 50
		})
	})
})

describe('serializeUri', () => {
	test('single segment', () => {
		expect(serializeUri({segments: [{channels: ['ko002']}]})).toBe('r4://@ko002')
	})
	test('multiple segments with options', () => {
		const cv: CompositeView = {
			segments: [{channels: ['alice'], tags: ['jazz']}, {channels: ['bob']}],
			order: 'shuffle',
			limit: 100
		}
		expect(serializeUri(cv)).toBe('r4://@alice #jazz;@bob?order=shuffle&limit=100')
	})
	test('exclude', () => {
		const cv: CompositeView = {
			segments: [{channels: ['ko002']}],
			exclude: ['uuid-1', 'uuid-2']
		}
		expect(serializeUri(cv)).toBe('r4://@ko002?exclude=uuid-1,uuid-2')
	})
})

describe('round-trip: parseUri ↔ serializeUri', () => {
	const uris = [
		'r4://@ko002',
		'r4://@ko002 #jazz',
		'r4://@alice #jazz;@bob #techno',
		'r4://@alice;@bob;@coco?order=shuffle&limit=100',
		'r4://@ko002?exclude=uuid-1,uuid-2'
	]
	for (const uri of uris) {
		test(`"${uri}"`, () => {
			const cv = parseUri(uri)
			const serialized = serializeUri(cv)
			const reparsed = parseUri(serialized)
			expect(reparsed).toEqual(cv)
		})
	}
})
