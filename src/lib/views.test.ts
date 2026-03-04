import {describe, test, expect} from 'vitest'
import {
	parseSource,
	serializeSource,
	parseView,
	serializeView,
	normalizeView,
	viewURI,
	viewLabel,
	viewFromUrl
} from './views'
import type {View} from './views'

const channelPrefixRe = /^@ko002\?/

describe('parseSource', () => {
	test('channels', () => {
		expect(parseSource('@alice @bob')).toEqual({channels: ['alice', 'bob']})
	})
	test('tags', () => {
		expect(parseSource('#jazz #dub')).toEqual({tags: ['jazz', 'dub']})
	})
	test('search', () => {
		expect(parseSource('miles davis')).toEqual({search: 'miles davis'})
	})
	test('mixed', () => {
		expect(parseSource('@ko002 #jazz miles davis')).toEqual({
			channels: ['ko002'],
			tags: ['jazz'],
			search: 'miles davis'
		})
	})
	test('deduplicates channels and tags', () => {
		expect(parseSource('@a @a #x #x')).toEqual({channels: ['a'], tags: ['x']})
	})
	test('empty input', () => {
		expect(parseSource('')).toEqual({})
	})
	test('bare @ and # are ignored', () => {
		expect(parseSource('@ #')).toEqual({})
	})
})

describe('serializeSource', () => {
	test('channels + tags + search', () => {
		expect(serializeSource({channels: ['alice'], tags: ['jazz'], search: 'hello'})).toBe('@alice #jazz hello')
	})
	test('empty source', () => {
		expect(serializeSource({})).toBe('')
	})
})

describe('round-trip: parseSource ↔ serializeSource', () => {
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
			const source = parseSource(input)
			const serialized = serializeSource(source)
			const reparsed = parseSource(serialized)
			expect(reparsed).toEqual(source)
		})
	}
})

describe('parseView', () => {
	test('single channel', () => {
		expect(parseView('@ko002')).toEqual({sources: [{channels: ['ko002']}]})
	})
	test('channel + tag + search with options', () => {
		expect(parseView('@ko002 #jazz miles davis?order=created&direction=asc&limit=50')).toEqual({
			sources: [{channels: ['ko002'], tags: ['jazz'], search: 'miles davis'}],
			order: 'created',
			direction: 'asc',
			limit: 50
		})
	})
	test('multiple sources', () => {
		expect(parseView('@alice #jazz;@bob #techno;@coco miles davis')).toEqual({
			sources: [
				{channels: ['alice'], tags: ['jazz']},
				{channels: ['bob'], tags: ['techno']},
				{channels: ['coco'], search: 'miles davis'}
			]
		})
	})
	test('exclude option', () => {
		expect(parseView('@ko002?exclude=uuid-1,uuid-2')).toEqual({
			sources: [{channels: ['ko002']}],
			exclude: ['uuid-1', 'uuid-2']
		})
	})
	test('tagsMode=all applies to sources with tags', () => {
		expect(parseView('#jazz #dub?tagsMode=all')).toEqual({
			sources: [{tags: ['jazz', 'dub'], tagsMode: 'all'}]
		})
	})
	test('empty input gives one empty source', () => {
		expect(parseView('')).toEqual({sources: [{}]})
	})
	test('shuffle with limit', () => {
		expect(parseView('?order=shuffle&limit=50')).toEqual({
			sources: [{}],
			order: 'shuffle',
			limit: 50
		})
	})
	test('strips r4:// prefix', () => {
		expect(parseView('r4://@alice #jazz;@bob #techno?order=shuffle')).toEqual({
			sources: [
				{channels: ['alice'], tags: ['jazz']},
				{channels: ['bob'], tags: ['techno']}
			],
			order: 'shuffle'
		})
	})
})

describe('serializeView', () => {
	test('single query', () => {
		expect(serializeView({sources: [{channels: ['ko002']}]})).toBe('@ko002')
	})
	test('multiple queries with options', () => {
		const view: View = {
			sources: [{channels: ['alice'], tags: ['jazz']}, {channels: ['bob']}],
			order: 'shuffle',
			limit: 100
		}
		expect(serializeView(view)).toBe('@alice #jazz;@bob?order=shuffle&limit=100')
	})
	test('exclude', () => {
		const view: View = {
			sources: [{channels: ['ko002']}],
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
		const view: View = {sources: [{channels: ['ko002'], tags: []}]}
		const result = normalizeView(view)
		expect(result).toBeDefined()
	})
	test('undefined input returns undefined', () => {
		expect(normalizeView(undefined)).toBeUndefined()
	})
})

describe('viewLabel', () => {
	test('single query', () => {
		const view: View = {sources: [{channels: ['ko002'], tags: ['jazz']}]}
		expect(viewLabel(view)).toBe('@ko002 #jazz')
	})
	test('multi-query includes all queries', () => {
		const view: View = {sources: [{channels: ['alice']}, {channels: ['bob']}]}
		expect(viewLabel(view)).toBe('@alice; @bob')
	})
	test('empty queries', () => {
		const view: View = {sources: [{}]}
		expect(viewLabel(view)).toBe('')
	})
})

describe('viewURI', () => {
	test('equivalent views produce same key', () => {
		const a: View = {sources: [{channels: ['ko002'], tags: ['jazz']}]}
		const b: View = {sources: [{channels: ['ko002'], tags: ['jazz']}]}
		expect(viewURI(a)).toBe(viewURI(b))
	})
	test('different views produce different keys', () => {
		const a: View = {sources: [{channels: ['a']}]}
		const b: View = {sources: [{channels: ['b']}]}
		expect(viewURI(a)).not.toBe(viewURI(b))
	})
	test('empty view', () => {
		expect(viewURI({sources: [{}]})).toBe('')
	})
})

// ─── Stress tests ───────────────────────────────────────────────

describe('parseSource: token splitting and adjacency', () => {
	test('#fish#apples — no space between tags', () => {
		// currently: one token '#fish#apples', starts with #, tag = 'fish#apples'
		// arguably should be two tags, but testing actual behavior
		const result = parseSource('#fish#apples')
		// BUG? This gives a single tag 'fish#apples' instead of ['fish', 'apples']
		expect(result).toEqual({tags: ['fish#apples']})
	})
	test('#fish #apples — space between tags', () => {
		expect(parseSource('#fish #apples')).toEqual({tags: ['fish', 'apples']})
	})
	test('@alice@bob — no space between channels', () => {
		// one token '@alice@bob', starts with @, slug = 'alice@bob'
		const result = parseSource('@alice@bob')
		expect(result).toEqual({channels: ['alice@bob']})
	})
	test('@alice#jazz — channel slug absorbs the #', () => {
		// one token '@alice#jazz', starts with @, slug = 'alice#jazz'
		const result = parseSource('@alice#jazz')
		expect(result).toEqual({channels: ['alice#jazz']})
	})
	test('#jazz@alice — tag absorbs the @', () => {
		const result = parseSource('#jazz@alice')
		expect(result).toEqual({tags: ['jazz@alice']})
	})
	test('comma-separated tags are not split', () => {
		// #jazz,dub is one token → one tag 'jazz,dub'
		expect(parseSource('#jazz,dub')).toEqual({tags: ['jazz,dub']})
	})
	test('search with special characters', () => {
		expect(parseSource('café naïve über')).toEqual({search: 'café naïve über'})
	})
	test('unicode in channels and tags', () => {
		expect(parseSource('@日本語 #音楽')).toEqual({channels: ['日本語'], tags: ['音楽']})
	})
})

describe('parseSource edge cases', () => {
	test('extra whitespace everywhere', () => {
		expect(parseSource('  @alice   #jazz   miles   davis  ')).toEqual({
			channels: ['alice'],
			tags: ['jazz'],
			search: 'miles davis'
		})
	})
	test('tabs and mixed whitespace', () => {
		expect(parseSource('@a\t#b\t\thello')).toEqual({
			channels: ['a'],
			tags: ['b'],
			search: 'hello'
		})
	})
	test('many channels', () => {
		const result = parseSource('@a @b @c @d @e @f @g @h @i @j')
		expect(result.channels).toHaveLength(10)
		expect(result.channels).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'])
	})
	test('many tags', () => {
		const result = parseSource('#a #b #c #d #e')
		expect(result.tags).toEqual(['a', 'b', 'c', 'd', 'e'])
	})
	test('search-only with multiple words', () => {
		expect(parseSource('the quick brown fox jumps')).toEqual({search: 'the quick brown fox jumps'})
	})
	test('channel slugs with hyphens and numbers', () => {
		expect(parseSource('@good-time-radio @ko002')).toEqual({
			channels: ['good-time-radio', 'ko002']
		})
	})
	test('tags with hyphens and numbers', () => {
		expect(parseSource('#lo-fi #80s #post-punk')).toEqual({
			tags: ['lo-fi', '80s', 'post-punk']
		})
	})
	test('interleaved tokens', () => {
		expect(parseSource('#jazz @alice hello @bob #dub world')).toEqual({
			channels: ['alice', 'bob'],
			tags: ['jazz', 'dub'],
			search: 'hello world'
		})
	})
	test('only whitespace', () => {
		expect(parseSource('   ')).toEqual({})
	})
})

describe('parseView multi-query stress', () => {
	test('5 queries mixed content', () => {
		const input = '@alice #jazz;@bob #techno;#ambient;miles davis;@coco @dan'
		const view = parseView(input)
		expect(view.sources).toHaveLength(5)
		expect(view.sources[0]).toEqual({channels: ['alice'], tags: ['jazz']})
		expect(view.sources[1]).toEqual({channels: ['bob'], tags: ['techno']})
		expect(view.sources[2]).toEqual({tags: ['ambient']})
		expect(view.sources[3]).toEqual({search: 'miles davis'})
		expect(view.sources[4]).toEqual({channels: ['coco', 'dan']})
	})

	test('multi-query with all options', () => {
		const input = '@alice;@bob;@coco?order=updated&direction=asc&limit=200&exclude=id1,id2,id3'
		const view = parseView(input)
		expect(view.sources).toHaveLength(3)
		expect(view.order).toBe('updated')
		expect(view.direction).toBe('asc')
		expect(view.limit).toBe(200)
		expect(view.exclude).toEqual(['id1', 'id2', 'id3'])
	})

	test('empty segments between semicolons are dropped', () => {
		const view = parseView('@alice;;@bob')
		// middle empty segment becomes {} which has 0 keys → filtered out
		expect(view.sources).toHaveLength(2)
		expect(view.sources[0]).toEqual({channels: ['alice']})
		expect(view.sources[1]).toEqual({channels: ['bob']})
	})

	test('trailing semicolon', () => {
		const view = parseView('@alice;')
		expect(view.sources).toHaveLength(1)
		expect(view.sources[0]).toEqual({channels: ['alice']})
	})

	test('leading semicolon', () => {
		const view = parseView(';@alice')
		expect(view.sources).toHaveLength(1)
		expect(view.sources[0]).toEqual({channels: ['alice']})
	})

	test('only semicolons gives empty query', () => {
		const view = parseView(';;;')
		expect(view.sources).toEqual([{}])
	})

	test('tagsMode=all with multi-query — only applies to queries with tags', () => {
		const view = parseView('@alice #jazz;@bob;#ambient #dub?tagsMode=all')
		expect(view.sources[0]).toEqual({channels: ['alice'], tags: ['jazz'], tagsMode: 'all'})
		expect(view.sources[1]).toEqual({channels: ['bob']}) // no tags → no tagsMode
		expect(view.sources[2]).toEqual({tags: ['ambient', 'dub'], tagsMode: 'all'})
	})

	test('tagsMode=any is ignored (it is the default)', () => {
		const view = parseView('#jazz?tagsMode=any')
		expect(view.sources[0]).toEqual({tags: ['jazz']})
		expect(view.sources[0].tagsMode).toBeUndefined()
	})
})

describe('parseView: URL encoding and ? boundary', () => {
	test('URL-encoded # in query (%23jazz) is NOT treated as a tag', () => {
		// if someone pastes a URL-encoded string, %23 is not #
		const view = parseView('%23jazz')
		expect(view.sources[0].tags).toBeUndefined()
		expect(view.sources[0].search).toBe('%23jazz')
	})
	test('URL-encoded @ (%40alice) is NOT treated as a channel', () => {
		const view = parseView('%40alice')
		expect(view.sources[0].channels).toBeUndefined()
		expect(view.sources[0].search).toBe('%40alice')
	})
	test('? at the very start — just options, no query content', () => {
		const view = parseView('?order=shuffle')
		expect(view.sources).toEqual([{}])
		expect(view.order).toBe('shuffle')
	})
	test('query with ? in search text', () => {
		// 'what is jazz?order=shuffle' — '?' splits at first occurrence
		// so search becomes 'what is jazz', order=shuffle
		const view = parseView('what is jazz?order=shuffle')
		expect(view.sources[0].search).toBe('what is jazz')
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
		// parseSource doesn't do URL decoding, so + stays as +
		const view = parseView('miles+davis')
		expect(view.sources[0].search).toBe('miles+davis')
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
		expect(view.sources).toEqual([{channels: ['ko002']}])
		expect(view.order).toBe('name')
		expect(view.direction).toBe('desc')
	})
})

describe('serializeView edge cases', () => {
	test('view with only options, empty query', () => {
		const view: View = {sources: [{}], order: 'shuffle', limit: 50}
		expect(serializeView(view)).toBe('?order=shuffle&limit=50')
	})
	test('multi-query where one query is empty', () => {
		const view: View = {sources: [{channels: ['alice']}, {}, {channels: ['bob']}]}
		// empty query serializes as '' → join gives 'alice;;bob'
		const result = serializeView(view)
		expect(result).toBe('@alice;;@bob')
	})
	test('all option types together', () => {
		const view: View = {
			sources: [{channels: ['ko002']}],
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
		const view: View = {sources: [{channels: ['ko002']}], direction: 'asc'}
		expect(serializeView(view)).toBe('@ko002?direction=asc')
	})
})

describe('serializeView → parseView: tagsMode round-trip', () => {
	test('tagsMode=all survives serialization', () => {
		const original: View = {
			sources: [{tags: ['jazz', 'dub'], tagsMode: 'all'}]
		}
		const serialized = serializeView(original)
		const reparsed = parseView(serialized)
		expect(reparsed.sources[0].tagsMode).toBe('all')
	})

	// Known limitation: tagsMode is a global param (?tagsMode=all), so mixed per-query
	// values (one query 'all', another default 'any') collapse — all tagged queries get 'all'.
	test.fails('mixed per-query tagsMode survives round-trip', () => {
		const original: View = {
			sources: [
				{tags: ['jazz'], tagsMode: 'all'},
				{tags: ['ambient']} // should stay 'any' (default)
			]
		}
		const serialized = serializeView(original)
		const reparsed = parseView(serialized)
		expect(reparsed.sources[0].tagsMode).toBe('all')
		expect(reparsed.sources[1].tagsMode).toBeUndefined()
	})

	test('tagsMode=all on multi-query survives serialization', () => {
		const original: View = {
			sources: [
				{channels: ['alice'], tags: ['jazz'], tagsMode: 'all'},
				{channels: ['bob']},
				{tags: ['ambient', 'dub'], tagsMode: 'all'}
			]
		}
		const serialized = serializeView(original)
		const reparsed = parseView(serialized)
		expect(reparsed.sources[0].tagsMode).toBe('all')
		expect(reparsed.sources[1].tagsMode).toBeUndefined()
		expect(reparsed.sources[2].tagsMode).toBe('all')
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
		const result = normalizeView({sources: [{channels: ['ko002'], tags: []}]})
		expect(result).toEqual({sources: [{channels: ['ko002']}]})
	})
	test('strips empty channels array', () => {
		const result = normalizeView({sources: [{channels: [], tags: ['jazz']}]})
		expect(result).toEqual({sources: [{tags: ['jazz']}]})
	})
	test('strips whitespace-only search', () => {
		const result = normalizeView({sources: [{search: '   '}]})
		expect(result).toBeUndefined() // query becomes empty → all-empty → undefined
	})
	test('preserves tagsMode=all', () => {
		const result = normalizeView({sources: [{tags: ['jazz'], tagsMode: 'all'}]})
		expect(result).toEqual({sources: [{tags: ['jazz'], tagsMode: 'all'}]})
	})
	test('strips tagsMode=any (default)', () => {
		const view: View = {sources: [{tags: ['jazz'], tagsMode: 'any'}]}
		const result = normalizeView(view)
		expect(result?.sources[0].tagsMode).toBeUndefined()
	})
	test('all queries empty but has options → returns view with empty query', () => {
		const result = normalizeView({sources: [{}, {}], order: 'shuffle'})
		expect(result).toEqual({sources: [{}], order: 'shuffle'})
	})
	test('multi-query: keeps populated, drops empty', () => {
		const result = normalizeView({
			sources: [{channels: ['alice']}, {tags: []}, {channels: ['bob'], tags: ['jazz']}, {search: ''}]
		})
		expect(result).toEqual({
			sources: [{channels: ['alice']}, {channels: ['bob'], tags: ['jazz']}]
		})
	})
	test('preserves exclude', () => {
		const result = normalizeView({sources: [{channels: ['ko002']}], exclude: ['a', 'b']})
		expect(result).toEqual({sources: [{channels: ['ko002']}], exclude: ['a', 'b']})
	})
	test('empty exclude is stripped', () => {
		const result = normalizeView({sources: [{channels: ['ko002']}], exclude: []})
		expect(result).toEqual({sources: [{channels: ['ko002']}]})
	})
})

describe('viewURI deep', () => {
	test('views with different order produce different keys', () => {
		const a: View = {sources: [{channels: ['ko002']}], order: 'shuffle'}
		const b: View = {sources: [{channels: ['ko002']}], order: 'created'}
		expect(viewURI(a)).not.toBe(viewURI(b))
	})
	test('view with options vs without', () => {
		const a: View = {sources: [{channels: ['ko002']}]}
		const b: View = {sources: [{channels: ['ko002']}], order: 'shuffle'}
		expect(viewURI(a)).not.toBe(viewURI(b))
	})
	test('ignores empty arrays via normalize', () => {
		const a: View = {sources: [{channels: ['ko002'], tags: []}]}
		const b: View = {sources: [{channels: ['ko002']}]}
		expect(viewURI(a)).toBe(viewURI(b))
	})
	test('undefined view', () => {
		expect(viewURI(undefined)).toBe('')
	})
	test('multi-query key', () => {
		const view: View = {sources: [{channels: ['alice']}, {channels: ['bob']}], order: 'shuffle'}
		const key = viewURI(view)
		expect(key).toBe('@alice;@bob?order=shuffle')
	})
})

describe('viewLabel deep', () => {
	test('multi-query with mixed content', () => {
		const view: View = {
			sources: [{channels: ['alice'], tags: ['jazz']}, {search: 'miles davis'}, {tags: ['ambient']}]
		}
		expect(viewLabel(view)).toBe('@alice #jazz; miles davis; #ambient')
	})
	test('ignores options', () => {
		const view: View = {sources: [{channels: ['ko002']}], order: 'shuffle', limit: 50}
		expect(viewLabel(view)).toBe('@ko002')
	})
	test('multi-query with empty queries mixed in', () => {
		const view: View = {sources: [{channels: ['alice']}, {}, {channels: ['bob']}]}
		// empty query serializes to '' → filter(Boolean) drops it
		expect(viewLabel(view)).toBe('@alice; @bob')
	})
})

describe('viewFromUrl', () => {
	test('q param parsed as channel', () => {
		const url = new URL('http://x.com/search?q=%40nikita')
		expect(viewFromUrl(url)).toEqual({sources: [{channels: ['nikita']}]})
	})
	test('q param with separate order param', () => {
		const url = new URL('http://x.com/search?q=%40ko002&order=shuffle')
		expect(viewFromUrl(url)).toEqual({
			sources: [{channels: ['ko002']}],
			order: 'shuffle'
		})
	})
	test('q param with limit and offset', () => {
		const url = new URL('http://x.com/search?q=%40ko002&limit=50&offset=50')
		expect(viewFromUrl(url)).toEqual({
			sources: [{channels: ['ko002']}],
			limit: 50,
			offset: 50
		})
	})
	test('multi-query in q param', () => {
		const url = new URL('http://x.com/search?q=%40alice%20%23jazz%3B%40bob%20%23techno')
		expect(viewFromUrl(url)).toEqual({
			sources: [
				{channels: ['alice'], tags: ['jazz']},
				{channels: ['bob'], tags: ['techno']}
			]
		})
	})
	test('no q param gives empty view', () => {
		const url = new URL('http://x.com/search')
		expect(viewFromUrl(url)).toEqual({sources: [{}]})
	})
	test('only options, no q', () => {
		const url = new URL('http://x.com/search?order=shuffle&limit=50')
		expect(viewFromUrl(url)).toEqual({sources: [{}], order: 'shuffle', limit: 50})
	})
})
