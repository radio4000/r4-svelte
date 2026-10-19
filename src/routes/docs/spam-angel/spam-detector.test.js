import {describe, expect, test} from 'vitest'
import {analyzeChannel} from './spam-detector.js'

describe('analyzeChannel structural track signals', () => {
	test('flags the weeklyreport.io fingerprint: url === discogs_url, non-music domain, long track description', () => {
		const channel = {name: 'Chill Vibes', description: '', created_at: '2024-01-01'}
		const tracks = /** @type {Array<import('#lib/types.js').Track>} */ ([
			{
				id: 't1',
				title: 'Track one',
				url: 'https://weeklyreport.io/',
				discogs_url: 'https://weeklyreport.io/',
				description: 'x'.repeat(500)
			},
			{
				id: 't2',
				title: 'Track two',
				url: 'https://weeklyreport.io/',
				discogs_url: 'https://weeklyreport.io/',
				description: 'y'.repeat(500)
			}
		])

		const result = analyzeChannel(channel, tracks)

		expect(result.isSpam).toBe(true)
		expect(result.evidence.trackSignals).toEqual(
			expect.arrayContaining(['2/2 non-music urls', 'url = discogs_url'])
		)
	})

	test('does not flag a channel whose tracks link to real music providers', () => {
		const channel = {name: 'Late Night Radio', description: '', created_at: '2024-01-01'}
		const tracks = /** @type {Array<import('#lib/types.js').Track>} */ ([
			{id: 't1', title: 'Song A', url: 'https://youtube.com/watch?v=abc', discogs_url: null},
			{id: 't2', title: 'Song B', url: 'https://soundcloud.com/artist/track', discogs_url: null}
		])

		const result = analyzeChannel(channel, tracks)

		expect(result.evidence.trackSignals).toEqual([])
		expect(result.isSpam).toBe(false)
	})

	test('a legit channel name/description does not get flooded by word lists alone', () => {
		// No tracks passed — word-list evidence should stay secondary, not force isSpam on its own
		const channel = {
			name: 'Local Plumbing Radio',
			description: 'we love music, we play tunes, we jam',
			created_at: '2024-01-01'
		}

		const result = analyzeChannel(channel, [])

		expect(result.isSpam).toBe(false)
	})
})
