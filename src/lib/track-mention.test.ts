import {readFileSync} from 'node:fs'
import {describe, expect, test} from 'vitest'
import {trackMentionUrl} from './track-mention'
import {
	channelViewFromUrl,
	parseView,
	serializeView,
	viewURI,
	viewFromUrl,
	viewToUrl
} from './views'
import {processViewTracks, resolveViewStrategy} from './views.svelte'
import type {Track} from './types'

const trackDescriptionLink = /<LinkEntities\b[^>]*\btext=\{track\.description\}[^>]*\/>/
const trackMentionSource = /\bmentionSlug=\{track\.slug\}/

function track(id: string, description: string | null): Track {
	return {
		id,
		description,
		slug: 'source',
		title: 'Test track',
		url: 'https://youtu.be/test',
		created_at: '2026-01-01',
		updated_at: '2026-01-01',
		tags: ['jazz'],
		discogs_url: null,
		duration: null,
		fts: null,
		mentions: null,
		playback_error: null
	}
}

const tracks = [
	track('exact', 'Thanks @foo.'),
	track('uppercase', 'From @FOO #jazz'),
	track('longer', 'From @foobar'),
	track('hyphen', 'From @foo-bar'),
	track('email', 'foo@example.com'),
	track('bare', 'foo'),
	track('missing', null)
]

describe('track mention links', () => {
	test('keeps the source and existing filters, drops scroll/pagination state', () => {
		const url = new URL(
			'https://radio4000.com/source/tracks?tags=jazz&q=thanks&mention=old&page=2#track-123'
		)
		const href = trackMentionUrl(url, 'source', 'FOO')
		expect(href).toBe('/source/tracks?tags=jazz&q=thanks&mention=foo')
		expect(url.searchParams.get('mention')).toBe('old')
		expect(url.hash).toBe('#track-123')
	})

	test('links from the source homepage to its tracks', () => {
		expect(trackMentionUrl(new URL('https://radio4000.com/source'), 'source', 'foo')).toBe(
			'/source/tracks?mention=foo'
		)
	})

	test('standalone/search/deck contexts do not inherit another radio or unrelated filters', () => {
		for (const path of [
			'/search?q=house',
			'/other/tracks?tags=dub',
			'/source/tracks/123?tab=info'
		]) {
			expect(trackMentionUrl(new URL(`https://radio4000.com${path}`), 'source', 'foo')).toBe(
				'/source/tracks?mention=foo'
			)
		}
	})

	test('doctor descriptions opt into filtering the track source radio', () => {
		const doctor = readFileSync('src/routes/[slug]/doctor/+page.svelte', 'utf8')
		const description = doctor.match(trackDescriptionLink)
		expect(description?.[0]).toMatch(trackMentionSource)
		expect(trackMentionUrl(new URL('https://radio4000.com/source/doctor'), 'source', 'foo')).toBe(
			'/source/tracks?mention=foo'
		)
	})

	test('supports an app base path and URL-encoded slugs', () => {
		expect(
			trackMentionUrl(
				new URL('https://example.com/r4/source/tracks?tags=jazz'),
				'source',
				'foo',
				'/r4'
			)
		).toBe('/r4/source/tracks?tags=jazz&mention=foo')
		expect(trackMentionUrl(new URL('https://example.com/search'), '日本語', 'foo')).toBe(
			'/%E6%97%A5%E6%9C%AC%E8%AA%9E/tracks?mention=foo'
		)
	})
})

describe('mention-filtered views', () => {
	test('the URL scopes to the original radio, separately from text and tags', () => {
		const view = channelViewFromUrl(
			new URL('https://radio4000.com/source/tracks?mention=FOO&tags=jazz&q=thanks'),
			'source'
		)
		expect(view.sources).toEqual([
			{channels: ['source'], tags: ['jazz'], tagsMode: 'all', search: 'thanks', mention: 'foo'}
		])
		expect(resolveViewStrategy(view.sources[0])).toBe('channel-filtered')
		expect(resolveViewStrategy({channels: ['source'], mention: 'foo'})).toBe('channel-filtered')
	})

	test('matches whole description tokens case-insensitively, not prefixes, bare text or stale columns', () => {
		const view = channelViewFromUrl(
			new URL('https://radio4000.com/source/tracks?mention=foo'),
			'source'
		)
		const stale = {...track('stale', 'No mention here'), mentions: ['@foo']}
		expect(processViewTracks([...tracks, stale], view).map((t) => t.id)).toEqual([
			'exact',
			'uppercase'
		])
	})

	test('does not impose the fuzzy search result cap on a mention', () => {
		const many = Array.from({length: 150}, (_, i) => track(String(i), '@foo'))
		expect(
			processViewTracks(many, {sources: [{channels: ['source'], mention: 'foo'}]})
		).toHaveLength(150)
	})

	test('combines with tags and text; clearing the mention restores ordinary results', () => {
		const url = new URL('https://radio4000.com/source/tracks?mention=foo&tags=jazz&q=thanks')
		expect(processViewTracks(tracks, channelViewFromUrl(url, 'source')).map((t) => t.id)).toEqual([
			'exact'
		])
		url.searchParams.delete('mention')
		url.searchParams.delete('q')
		expect(processViewTracks(tracks, channelViewFromUrl(url, 'source'))).toHaveLength(tracks.length)
	})

	test('retains mention semantics and source identity across saved/deck view round trips', () => {
		const view = channelViewFromUrl(
			new URL('https://radio4000.com/source/tracks?mention=foo'),
			'source'
		)
		expect(parseView(serializeView(view))).toEqual(view)
		expect(viewFromUrl(new URL(viewToUrl('/search', view), 'https://radio4000.com'))).toEqual(view)
		expect(viewURI(view)).not.toBe(viewURI({sources: [{channels: ['source']}]}))
		expect(processViewTracks(tracks, parseView(serializeView(view))).map((t) => t.id)).toEqual([
			'exact',
			'uppercase'
		])
	})
})
