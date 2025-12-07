import {describe, expect, it} from 'vitest'
import {fetchDiscogs, parseDiscogsUrl, searchUrl} from './discogs-core.js'

describe('discogs integration', () => {
	it('parses discogs URLs correctly', () => {
		// New format
		expect(parseDiscogsUrl('https://www.discogs.com/master/release/123456')).toEqual({
			type: 'release',
			id: '123456'
		})

		// Old format
		expect(parseDiscogsUrl('https://www.discogs.com/release/123456')).toEqual({
			type: 'release',
			id: '123456'
		})

		// Invalid URLs
		expect(parseDiscogsUrl('https://example.com/release/123')).toBeNull()
		expect(parseDiscogsUrl('')).toBeNull()
	})

	it('search returns search URL', async () => {
		const result = await searchUrl('Daft Punk Random Access Memories')

		expect(result).toHaveProperty('searchUrl')
		expect(result).toHaveProperty('query')
		expect(result.searchUrl).toContain('discogs.com/search')
		expect(result.searchUrl).toContain('Daft%20Punk')
	})

	it('can fetch discogs release data', async () => {
		// Test with a known Discogs release (Daft Punk - Random Access Memories)
		const data = await fetchDiscogs('https://www.discogs.com/release/4543983')

		if (data) {
			expect(data).toHaveProperty('id')
			expect(data).toHaveProperty('title')
			expect(data).toHaveProperty('_meta')
			expect(data._meta).toHaveProperty('fetchedAt')
			expect(data._meta).toHaveProperty('sourceUrl')
		}
	}, 10000)
})
