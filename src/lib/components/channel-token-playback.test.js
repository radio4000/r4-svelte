import {describe, expect, test} from 'vitest'
import {filterTracksByToken, normalizeMentionToken, normalizeTagToken} from '$lib/components/channel-token-playback.js'

describe('normalizeTagToken', () => {
	test('normalizes full-width/hash prefixes and punctuation', () => {
		expect(normalizeTagToken(' #Dub, ')).toBe('dub')
		expect(normalizeTagToken('＃Ambient!')).toBe('ambient')
		expect(normalizeTagToken('﹟House;')).toBe('house')
	})
})

describe('normalizeMentionToken', () => {
	test('normalizes mention prefix and punctuation', () => {
		expect(normalizeMentionToken('@KO002,')).toBe('ko002')
		expect(normalizeMentionToken(' seance-centre! ')).toBe('seance-centre')
	})
})

describe('filterTracksByToken', () => {
	test('finds tag matches and sorts newest first', () => {
		const tracks = [
			{id: '1', created_at: '2024-01-01T00:00:00.000Z', tags: ['#Dub']},
			{id: '2', created_at: '2024-02-01T00:00:00.000Z', tags: ['#jazz']},
			{id: '3', created_at: '2024-03-01T00:00:00.000Z', tags: ['＃DUB']}
		]
		const result = filterTracksByToken(tracks, 'tag', '#dub')
		expect(result.title).toBe('#dub')
		expect(result.matches.map((track) => track.id)).toEqual(['3', '1'])
	})

	test('finds mention matches and sorts newest first', () => {
		const tracks = [
			{id: '1', created_at: '2024-01-01T00:00:00.000Z', mentions: ['@ko002']},
			{id: '2', created_at: '2024-03-01T00:00:00.000Z', mentions: ['@other']},
			{id: '3', created_at: '2024-02-01T00:00:00.000Z', mentions: ['ko002']}
		]
		const result = filterTracksByToken(tracks, 'mention', '@KO002')
		expect(result.title).toBe('@ko002')
		expect(result.matches.map((track) => track.id)).toEqual(['3', '1'])
	})
})
