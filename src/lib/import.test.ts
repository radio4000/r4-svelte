import {describe, test, expect} from 'vitest'
import {parseTxtFile, parseM3u, parseTrackTxt, validateBackup, importedSlug} from './import'

describe('importedSlug', () => {
	test('appends -import- and first 8 chars of id', () => {
		expect(importedSlug('ko002', 'e0701ff6-1234-5678-abcd-ef0123456789')).toBe('ko002-import-e0701ff6')
	})
})

describe('parseTxtFile', () => {
	const sample = `ko002 🏝️
========

click #am #pm
Info:
  ID: e0701ff6-1234-5678-abcd-ef0123456789
  Slug: ko002
  Website: https://radio4000.com/ko002
  Image: afeerseziomykfzwtr9e
  Latitude: 52.48
  Longitude: 13.41`

	test('parses name from first line', () => {
		expect(parseTxtFile(sample, 'fallback').name).toBe('ko002 🏝️')
	})

	test('parses slug from Info block', () => {
		expect(parseTxtFile(sample, 'fallback').slug).toBe('ko002')
	})

	test('parses id from Info block', () => {
		expect(parseTxtFile(sample, 'fallback').id).toBe('e0701ff6-1234-5678-abcd-ef0123456789')
	})

	test('parses description (lines between separator and Info:)', () => {
		expect(parseTxtFile(sample, 'fallback').description).toBe('click #am #pm')
	})

	test('falls back to fallbackName when no Info block', () => {
		const minimal = 'My Channel\n========\n'
		const result = parseTxtFile(minimal, 'my-channel')
		expect(result.name).toBe('My Channel')
		expect(result.slug).toBe('my-channel')
	})
})

describe('parseM3u', () => {
	const sample = `#EXTM3U
#EXTINF:-1,Crash Bandicoot OST - Invincible
https://www.youtube.com/watch?v=nCh_-en7RWo
#EXTINF:-1,Araya - Dancer
https://www.youtube.com/watch?v=vo3uuysToRc
#EXTINF:-1,Local file
/home/user/music/track.m4a`

	test('returns http tracks', () => {
		const tracks = parseM3u(sample)
		expect(tracks).toHaveLength(2)
	})

	test('parses title from EXTINF', () => {
		expect(parseM3u(sample)[0].title).toBe('Crash Bandicoot OST - Invincible')
	})

	test('parses url', () => {
		expect(parseM3u(sample)[0].url).toBe('https://www.youtube.com/watch?v=nCh_-en7RWo')
	})

	test('skips local file paths', () => {
		const tracks = parseM3u(sample)
		expect(tracks.every((t) => t.url.startsWith('http'))).toBe(true)
	})

	test('empty content returns empty array', () => {
		expect(parseM3u('#EXTM3U\n')).toHaveLength(0)
	})
})

describe('parseTrackTxt', () => {
	const sample = `02. Funked Up
ty -@hardlife #pm #techno light questionning
  https://youtu.be/6KPLEbCDhXA`

	test('parses title from first line', () => {
		expect(parseTrackTxt(sample).title).toBe('02. Funked Up')
	})

	test('parses original url (last http line)', () => {
		expect(parseTrackTxt(sample).url).toBe('https://youtu.be/6KPLEbCDhXA')
	})

	test('parses description (lines between title and url)', () => {
		expect(parseTrackTxt(sample).description).toBe('ty -@hardlife #pm #techno light questionning')
	})

	test('handles track with no description', () => {
		const minimal = 'Track Title\n  https://youtu.be/abc123'
		const result = parseTrackTxt(minimal)
		expect(result.title).toBe('Track Title')
		expect(result.url).toBe('https://youtu.be/abc123')
		expect(result.description).toBe('')
	})
})

describe('validateBackup', () => {
	const valid = {
		channel: {id: 'abc', slug: 'my-channel', name: 'My Channel'},
		tracks: [{id: 't1', url: 'https://youtube.com/watch?v=x', slug: 'my-channel', title: 'T'}]
	}

	test('passes for valid backup', () => {
		expect(() => validateBackup(valid)).not.toThrow()
	})

	test('throws for non-object', () => {
		expect(() => validateBackup('string')).toThrow('Not a valid JSON object.')
	})

	test('throws for missing channel', () => {
		expect(() => validateBackup({tracks: []})).toThrow('Missing channel.')
	})

	test('throws for missing channel.id', () => {
		expect(() => validateBackup({channel: {slug: 'x', name: 'x'}, tracks: []})).toThrow('Missing channel.id.')
	})

	test('throws for missing channel.slug', () => {
		expect(() => validateBackup({channel: {id: 'x', name: 'x'}, tracks: []})).toThrow('Missing channel.slug.')
	})

	test('throws for missing channel.name', () => {
		expect(() => validateBackup({channel: {id: 'x', slug: 'x'}, tracks: []})).toThrow('Missing channel.name.')
	})

	test('throws when tracks is not an array', () => {
		expect(() => validateBackup({channel: {id: 'x', slug: 'x', name: 'x'}, tracks: null})).toThrow('Missing tracks array.')
	})

	test('throws for track missing url', () => {
		expect(() =>
			validateBackup({channel: {id: 'x', slug: 'x', name: 'x'}, tracks: [{id: 't1'}]})
		).toThrow('Track 0: missing url.')
	})
})
