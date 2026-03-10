import {describe, test, expect} from 'vitest'
import {parseTxtFile, parseM3u, parseTrackTxt, validateBackup, importedSlug, buildFromBackup} from './import'
import type {BackupData} from './import'
import type {Channel, Track} from './types'

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

	test('parses all fields from a full channel txt', () => {
		const result = parseTxtFile(sample, 'fallback')
		expect(result.name).toBe('ko002 🏝️')
		expect(result.slug).toBe('ko002')
		expect(result.id).toBe('e0701ff6-1234-5678-abcd-ef0123456789')
		expect(result.description).toBe('click #am #pm')
	})

	test('falls back to fallbackName when no Info block', () => {
		const result = parseTxtFile('My Channel\n========\n', 'my-channel')
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

	test('parses http tracks, skips local paths', () => {
		const tracks = parseM3u(sample)
		expect(tracks).toHaveLength(2)
		expect(tracks[0]).toEqual({
			title: 'Crash Bandicoot OST - Invincible',
			url: 'https://www.youtube.com/watch?v=nCh_-en7RWo'
		})
		expect(tracks.every((t) => t.url.startsWith('http'))).toBe(true)
	})

	test('empty content returns empty array', () => {
		expect(parseM3u('#EXTM3U\n')).toHaveLength(0)
	})
})

describe('parseTrackTxt', () => {
	test('parses title, description, and url', () => {
		const result = parseTrackTxt(`02. Funked Up
ty -@hardlife #pm #techno light questionning
  https://youtu.be/6KPLEbCDhXA`)
		expect(result.title).toBe('02. Funked Up')
		expect(result.description).toBe('ty -@hardlife #pm #techno light questionning')
		expect(result.url).toBe('https://youtu.be/6KPLEbCDhXA')
	})

	test('handles track with no description', () => {
		const result = parseTrackTxt('Track Title\n  https://youtu.be/abc123')
		expect(result).toEqual({title: 'Track Title', url: 'https://youtu.be/abc123', description: ''})
	})
})

describe('validateBackup', () => {
	const ch = {id: 'x', slug: 'x', name: 'x'}

	test('passes for valid backup', () => {
		expect(() => validateBackup({channel: ch, tracks: [{url: 'https://y.com/v'}]})).not.toThrow()
	})

	test.each([
		['non-object', 'string', 'Not a valid JSON object.'],
		['missing channel', {tracks: []}, 'Missing channel.'],
		['missing channel.id', {channel: {slug: 'x', name: 'x'}, tracks: []}, 'Missing channel.id.'],
		['missing channel.slug', {channel: {id: 'x', name: 'x'}, tracks: []}, 'Missing channel.slug.'],
		['missing channel.name', {channel: {id: 'x', slug: 'x'}, tracks: []}, 'Missing channel.name.'],
		['non-array tracks', {channel: ch, tracks: null}, 'Missing tracks array.'],
		['track missing url', {channel: ch, tracks: [{id: 't1'}]}, 'Track 0: missing url.']
	])('throws for %s', (_label, data, message) => {
		expect(() => validateBackup(data)).toThrow(message)
	})
})

describe('buildFromBackup', () => {
	function backup(channel: Partial<Channel> = {}, tracks: Partial<Track>[] = []): BackupData {
		return {
			channel: {
				id: 'e0701ff6-1234-5678-abcd-ef0123456789',
				slug: 'ko002',
				name: 'Ko002',
				created_at: '',
				updated_at: '',
				...channel
			},
			tracks
		} as BackupData
	}

	test('uses the provided slug for channel and tracks', () => {
		const {channel} = buildFromBackup(backup(), 'ko002-import-20240522-ab12')
		expect(channel.slug).toBe('ko002-import-20240522-ab12')
	})

	test('replaces channel id with a new uuid', () => {
		const {channel} = buildFromBackup(backup({id: 'original-id'}), 'ko002-import-abc')
		expect(channel.id).not.toBe('original-id')
		expect(channel.id).toBeTruthy()
	})

	test('replaces track ids and assigns the new slug', () => {
		const {channel, tracks} = buildFromBackup(
			backup({}, [
				{id: 'old-track-id', slug: 'ko002', url: 'https://y.com/a', title: 'A'},
				{id: 'old-track-id-2', slug: 'ko002', url: 'https://y.com/b', title: 'B'}
			]),
			'ko002-import-abc'
		)
		expect(tracks).toHaveLength(2)
		expect(tracks[0].id).not.toBe('old-track-id')
		expect(tracks[0].slug).toBe(channel.slug)
		expect(tracks[1].slug).toBe(channel.slug)
	})

	test('preserves extra track fields like description', () => {
		const {tracks} = buildFromBackup(
			backup({}, [{id: 't1', slug: 'ko002', url: 'https://y.com/v', title: 'T', description: 'keep me'}]),
			'ko002-import-abc'
		)
		expect(tracks[0].description).toBe('keep me')
	})
})
