import {describe, test, expect} from 'vitest'
import {parseQuery, serializeQuery, parseView, serializeView, normalizeView, viewKey, viewLabel} from './views'
import type {View} from './views'

const channelPrefixRe = /^@ko002\?/

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

// ─── Stress tests ───────────────────────────────────────────────

describe('parseQuery: token splitting and adjacency', () => {
	test('#fish#apples — no space between tags', () => {
		// currently: one token '#fish#apples', starts with #, tag = 'fish#apples'
		// arguably should be two tags, but testing actual behavior
		const result = parseQuery('#fish#apples')
		// BUG? This gives a single tag 'fish#apples' instead of ['fish', 'apples']
		expect(result).toEqual({tags: ['fish#apples']})
	})
	test('#fish #apples — space between tags', () => {
		expect(parseQuery('#fish #apples')).toEqual({tags: ['fish', 'apples']})
	})
	test('@alice@bob — no space between channels', () => {
		// one token '@alice@bob', starts with @, slug = 'alice@bob'
		const result = parseQuery('@alice@bob')
		expect(result).toEqual({channels: ['alice@bob']})
	})
	test('@alice#jazz — channel slug absorbs the #', () => {
		// one token '@alice#jazz', starts with @, slug = 'alice#jazz'
		const result = parseQuery('@alice#jazz')
		expect(result).toEqual({channels: ['alice#jazz']})
	})
	test('#jazz@alice — tag absorbs the @', () => {
		const result = parseQuery('#jazz@alice')
		expect(result).toEqual({tags: ['jazz@alice']})
	})
	test('comma-separated tags are not split', () => {
		// #jazz,dub is one token → one tag 'jazz,dub'
		expect(parseQuery('#jazz,dub')).toEqual({tags: ['jazz,dub']})
	})
	test('search with special characters', () => {
		expect(parseQuery('café naïve über')).toEqual({search: 'café naïve über'})
	})
	test('unicode in channels and tags', () => {
		expect(parseQuery('@日本語 #音楽')).toEqual({channels: ['日本語'], tags: ['音楽']})
	})
})

describe('parseQuery edge cases', () => {
	test('extra whitespace everywhere', () => {
		expect(parseQuery('  @alice   #jazz   miles   davis  ')).toEqual({
			channels: ['alice'],
			tags: ['jazz'],
			search: 'miles davis'
		})
	})
	test('tabs and mixed whitespace', () => {
		expect(parseQuery('@a\t#b\t\thello')).toEqual({
			channels: ['a'],
			tags: ['b'],
			search: 'hello'
		})
	})
	test('many channels', () => {
		const result = parseQuery('@a @b @c @d @e @f @g @h @i @j')
		expect(result.channels).toHaveLength(10)
		expect(result.channels).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'])
	})
	test('many tags', () => {
		const result = parseQuery('#a #b #c #d #e')
		expect(result.tags).toEqual(['a', 'b', 'c', 'd', 'e'])
	})
	test('search-only with multiple words', () => {
		expect(parseQuery('the quick brown fox jumps')).toEqual({search: 'the quick brown fox jumps'})
	})
	test('channel slugs with hyphens and numbers', () => {
		expect(parseQuery('@good-time-radio @ko002')).toEqual({
			channels: ['good-time-radio', 'ko002']
		})
	})
	test('tags with hyphens and numbers', () => {
		expect(parseQuery('#lo-fi #80s #post-punk')).toEqual({
			tags: ['lo-fi', '80s', 'post-punk']
		})
	})
	test('interleaved tokens', () => {
		expect(parseQuery('#jazz @alice hello @bob #dub world')).toEqual({
			channels: ['alice', 'bob'],
			tags: ['jazz', 'dub'],
			search: 'hello world'
		})
	})
	test('only whitespace', () => {
		expect(parseQuery('   ')).toEqual({})
	})
})

describe('parseView multi-query stress', () => {
	test('5 queries mixed content', () => {
		const input = '@alice #jazz;@bob #techno;#ambient;miles davis;@coco @dan'
		const view = parseView(input)
		expect(view.queries).toHaveLength(5)
		expect(view.queries[0]).toEqual({channels: ['alice'], tags: ['jazz']})
		expect(view.queries[1]).toEqual({channels: ['bob'], tags: ['techno']})
		expect(view.queries[2]).toEqual({tags: ['ambient']})
		expect(view.queries[3]).toEqual({search: 'miles davis'})
		expect(view.queries[4]).toEqual({channels: ['coco', 'dan']})
	})

	test('multi-query with all options', () => {
		const input = '@alice;@bob;@coco?order=updated&direction=asc&limit=200&exclude=id1,id2,id3'
		const view = parseView(input)
		expect(view.queries).toHaveLength(3)
		expect(view.order).toBe('updated')
		expect(view.direction).toBe('asc')
		expect(view.limit).toBe(200)
		expect(view.exclude).toEqual(['id1', 'id2', 'id3'])
	})

	test('empty segments between semicolons are dropped', () => {
		const view = parseView('@alice;;@bob')
		// middle empty segment becomes {} which has 0 keys → filtered out
		expect(view.queries).toHaveLength(2)
		expect(view.queries[0]).toEqual({channels: ['alice']})
		expect(view.queries[1]).toEqual({channels: ['bob']})
	})

	test('trailing semicolon', () => {
		const view = parseView('@alice;')
		expect(view.queries).toHaveLength(1)
		expect(view.queries[0]).toEqual({channels: ['alice']})
	})

	test('leading semicolon', () => {
		const view = parseView(';@alice')
		expect(view.queries).toHaveLength(1)
		expect(view.queries[0]).toEqual({channels: ['alice']})
	})

	test('only semicolons gives empty query', () => {
		const view = parseView(';;;')
		expect(view.queries).toEqual([{}])
	})

	test('tagsMode=all with multi-query — only applies to queries with tags', () => {
		const view = parseView('@alice #jazz;@bob;#ambient #dub?tagsMode=all')
		expect(view.queries[0]).toEqual({channels: ['alice'], tags: ['jazz'], tagsMode: 'all'})
		expect(view.queries[1]).toEqual({channels: ['bob']}) // no tags → no tagsMode
		expect(view.queries[2]).toEqual({tags: ['ambient', 'dub'], tagsMode: 'all'})
	})

	test('tagsMode=any is ignored (it is the default)', () => {
		const view = parseView('#jazz?tagsMode=any')
		expect(view.queries[0]).toEqual({tags: ['jazz']})
		expect(view.queries[0].tagsMode).toBeUndefined()
	})
})

describe('parseView: URL encoding and ? boundary', () => {
	test('URL-encoded # in query (%23jazz) is NOT treated as a tag', () => {
		// if someone pastes a URL-encoded string, %23 is not #
		const view = parseView('%23jazz')
		expect(view.queries[0].tags).toBeUndefined()
		expect(view.queries[0].search).toBe('%23jazz')
	})
	test('URL-encoded @ (%40alice) is NOT treated as a channel', () => {
		const view = parseView('%40alice')
		expect(view.queries[0].channels).toBeUndefined()
		expect(view.queries[0].search).toBe('%40alice')
	})
	test('? at the very start — just options, no query content', () => {
		const view = parseView('?order=shuffle')
		expect(view.queries).toEqual([{}])
		expect(view.order).toBe('shuffle')
	})
	test('query with ? in search text', () => {
		// 'what is jazz?order=shuffle' — '?' splits at first occurrence
		// so search becomes 'what is jazz', order=shuffle
		const view = parseView('what is jazz?order=shuffle')
		expect(view.queries[0].search).toBe('what is jazz')
		expect(view.order).toBe('shuffle')
	})
	test('semicolon in options part is treated as URLSearchParams separator', () => {
		// URLSearchParams actually does NOT treat ; as separator (only &)
		// so 'order=shuffle;limit=50' → order = 'shuffle;limit=50' (invalid)
		const view = parseView('@ko002?order=shuffle;limit=50')
		// 'shuffle;limit=50' is not a valid order → ignored? or partial match?
		expect(view.order).toBeUndefined() // invalid value
	})
	test('+ in search is literal (not space)', () => {
		// parseQuery doesn't do URL decoding, so + stays as +
		const view = parseView('miles+davis')
		expect(view.queries[0].search).toBe('miles+davis')
	})
})

describe('parseView option edge cases', () => {
	test('invalid order value is ignored', () => {
		const view = parseView('@ko002?order=banana')
		expect(view.order).toBeUndefined()
	})
	test('invalid direction value is ignored', () => {
		const view = parseView('@ko002?direction=sideways')
		expect(view.direction).toBeUndefined()
	})
	test('limit=0 is ignored', () => {
		const view = parseView('@ko002?limit=0')
		expect(view.limit).toBeUndefined()
	})
	test('negative limit is ignored', () => {
		const view = parseView('@ko002?limit=-10')
		expect(view.limit).toBeUndefined()
	})
	test('limit is clamped to 4000', () => {
		const view = parseView('@ko002?limit=99999')
		expect(view.limit).toBe(4000)
	})
	test('limit=1 is valid', () => {
		const view = parseView('@ko002?limit=1')
		expect(view.limit).toBe(1)
	})
	test('non-numeric limit is ignored', () => {
		const view = parseView('@ko002?limit=abc')
		expect(view.limit).toBeUndefined()
	})
	test('unknown options are ignored', () => {
		const view = parseView('@ko002?foo=bar&order=shuffle&baz=qux')
		expect(view.order).toBe('shuffle')
		expect(view).not.toHaveProperty('foo')
		expect(view).not.toHaveProperty('baz')
	})
	test('empty exclude is ignored', () => {
		const view = parseView('@ko002?exclude=')
		expect(view.exclude).toBeUndefined()
	})
	test('exclude with trailing comma', () => {
		const view = parseView('@ko002?exclude=id1,id2,')
		expect(view.exclude).toEqual(['id1', 'id2'])
	})
	test('r4:// with options', () => {
		const view = parseView('r4://@ko002?order=name&direction=desc')
		expect(view.queries).toEqual([{channels: ['ko002']}])
		expect(view.order).toBe('name')
		expect(view.direction).toBe('desc')
	})
})

describe('serializeView edge cases', () => {
	test('view with only options, empty query', () => {
		const view: View = {queries: [{}], order: 'shuffle', limit: 50}
		expect(serializeView(view)).toBe('?order=shuffle&limit=50')
	})
	test('multi-query where one query is empty', () => {
		const view: View = {queries: [{channels: ['alice']}, {}, {channels: ['bob']}]}
		// empty query serializes as '' → join gives 'alice;;bob'
		const result = serializeView(view)
		expect(result).toBe('@alice;;@bob')
	})
	test('all option types together', () => {
		const view: View = {
			queries: [{channels: ['ko002']}],
			order: 'created',
			direction: 'desc',
			limit: 100,
			exclude: ['a', 'b']
		}
		const result = serializeView(view)
		expect(result).toContain('order=created')
		expect(result).toContain('direction=desc')
		expect(result).toContain('limit=100')
		expect(result).toContain('exclude=a,b')
		expect(result).toMatch(channelPrefixRe)
	})
	test('direction without order', () => {
		const view: View = {queries: [{channels: ['ko002']}], direction: 'asc'}
		expect(serializeView(view)).toBe('@ko002?direction=asc')
	})
})

describe('serializeView → parseView: tagsMode round-trip', () => {
	test('tagsMode=all survives serialization', () => {
		const original: View = {
			queries: [{tags: ['jazz', 'dub'], tagsMode: 'all'}]
		}
		const serialized = serializeView(original)
		const reparsed = parseView(serialized)
		expect(reparsed.queries[0].tagsMode).toBe('all')
	})

	test('tagsMode=all on multi-query survives serialization', () => {
		const original: View = {
			queries: [
				{channels: ['alice'], tags: ['jazz'], tagsMode: 'all'},
				{channels: ['bob']},
				{tags: ['ambient', 'dub'], tagsMode: 'all'}
			]
		}
		const serialized = serializeView(original)
		const reparsed = parseView(serialized)
		expect(reparsed.queries[0].tagsMode).toBe('all')
		expect(reparsed.queries[1].tagsMode).toBeUndefined()
		expect(reparsed.queries[2].tagsMode).toBe('all')
	})
})

describe('round-trip: parseView ↔ serializeView (extended)', () => {
	const cases = [
		'@alice #jazz;@bob #techno;@coco miles davis',
		'#jazz #dub',
		'miles davis',
		'@a @b @c @d @e?order=shuffle&limit=100',
		'@ko002?order=created&direction=asc&limit=50',
		'?order=shuffle&limit=50',
		'@ko002?exclude=uuid-1,uuid-2,uuid-3',
		'@alice #jazz;@bob?exclude=x,y'
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

describe('normalizeView deep', () => {
	test('strips empty tags array', () => {
		const result = normalizeView({queries: [{channels: ['ko002'], tags: []}]})
		expect(result).toEqual({queries: [{channels: ['ko002']}]})
	})
	test('strips empty channels array', () => {
		const result = normalizeView({queries: [{channels: [], tags: ['jazz']}]})
		expect(result).toEqual({queries: [{tags: ['jazz']}]})
	})
	test('strips whitespace-only search', () => {
		const result = normalizeView({queries: [{search: '   '}]})
		expect(result).toBeUndefined() // query becomes empty → all-empty → undefined
	})
	test('preserves tagsMode=all', () => {
		const result = normalizeView({queries: [{tags: ['jazz'], tagsMode: 'all'}]})
		expect(result).toEqual({queries: [{tags: ['jazz'], tagsMode: 'all'}]})
	})
	test('strips tagsMode=any (default)', () => {
		const view: View = {queries: [{tags: ['jazz'], tagsMode: 'any'}]}
		const result = normalizeView(view)
		expect(result?.queries[0].tagsMode).toBeUndefined()
	})
	test('all queries empty but has options → returns view with empty query', () => {
		const result = normalizeView({queries: [{}, {}], order: 'shuffle'})
		expect(result).toEqual({queries: [{}], order: 'shuffle'})
	})
	test('multi-query: keeps populated, drops empty', () => {
		const result = normalizeView({
			queries: [{channels: ['alice']}, {tags: []}, {channels: ['bob'], tags: ['jazz']}, {search: ''}]
		})
		expect(result).toEqual({
			queries: [{channels: ['alice']}, {channels: ['bob'], tags: ['jazz']}]
		})
	})
	test('preserves exclude', () => {
		const result = normalizeView({queries: [{channels: ['ko002']}], exclude: ['a', 'b']})
		expect(result).toEqual({queries: [{channels: ['ko002']}], exclude: ['a', 'b']})
	})
	test('empty exclude is stripped', () => {
		const result = normalizeView({queries: [{channels: ['ko002']}], exclude: []})
		expect(result).toEqual({queries: [{channels: ['ko002']}]})
	})
})

describe('viewKey deep', () => {
	test('views with different order produce different keys', () => {
		const a: View = {queries: [{channels: ['ko002']}], order: 'shuffle'}
		const b: View = {queries: [{channels: ['ko002']}], order: 'created'}
		expect(viewKey(a)).not.toBe(viewKey(b))
	})
	test('view with options vs without', () => {
		const a: View = {queries: [{channels: ['ko002']}]}
		const b: View = {queries: [{channels: ['ko002']}], order: 'shuffle'}
		expect(viewKey(a)).not.toBe(viewKey(b))
	})
	test('ignores empty arrays via normalize', () => {
		const a: View = {queries: [{channels: ['ko002'], tags: []}]}
		const b: View = {queries: [{channels: ['ko002']}]}
		expect(viewKey(a)).toBe(viewKey(b))
	})
	test('undefined view', () => {
		expect(viewKey(undefined)).toBe('')
	})
	test('multi-query key', () => {
		const view: View = {queries: [{channels: ['alice']}, {channels: ['bob']}], order: 'shuffle'}
		const key = viewKey(view)
		expect(key).toBe('@alice;@bob?order=shuffle')
	})
})

describe('viewLabel deep', () => {
	test('multi-query with mixed content', () => {
		const view: View = {
			queries: [{channels: ['alice'], tags: ['jazz']}, {search: 'miles davis'}, {tags: ['ambient']}]
		}
		expect(viewLabel(view)).toBe('@alice #jazz; miles davis; #ambient')
	})
	test('ignores options', () => {
		const view: View = {queries: [{channels: ['ko002']}], order: 'shuffle', limit: 50}
		expect(viewLabel(view)).toBe('@ko002')
	})
	test('multi-query with empty queries mixed in', () => {
		const view: View = {queries: [{channels: ['alice']}, {}, {channels: ['bob']}]}
		// empty query serializes to '' → filter(Boolean) drops it
		expect(viewLabel(view)).toBe('@alice; @bob')
	})
})
