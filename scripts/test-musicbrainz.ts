/**
 * Test the MusicBrainz title → metadata pipeline.
 * Usage: bun scripts/test-musicbrainz.ts
 */
import {parseTitle, cleanTitle} from 'media-now/parse-title'

async function search(title: string) {
	if (!title) return null
	const parsed = parseTitle(title)

	const strategies: {query: string; description: string}[] = []

	if (parsed.artist) {
		strategies.push({
			query: `artist:"${parsed.artist}" AND recording:"${parsed.title}"`,
			description: `Exact artist + title`,
		})
		strategies.push({
			query: `artist:${parsed.artist} AND recording:${parsed.title}`,
			description: `Fuzzy artist + title`,
		})
	}
	strategies.push({
		query: `recording:"${parsed.title}"`,
		description: `Exact title only`,
	})
	strategies.push({
		query: `recording:${parsed.title}`,
		description: `Fuzzy title only`,
	})

	for (const strategy of strategies) {
		const encodedQuery = encodeURIComponent(strategy.query)
		const url = `https://musicbrainz.org/ws/2/recording?query=${encodedQuery}&fmt=json&limit=3`
		console.log(`\n--- Strategy: ${strategy.description}`)
		console.log(`    Query: ${strategy.query}`)

		const response = await fetch(url, {
			headers: {'User-Agent': 'r4-sync-tests/0.1 (https://radio4000.com)'},
		})

		if (!response.ok) {
			console.log(`    HTTP ${response.status}`)
			continue
		}

		const data = await response.json()
		if (!data.recordings?.length) {
			console.log('    No results')
			continue
		}

		for (const rec of data.recordings) {
			const artists = rec['artist-credit']?.map((a: any) => a.name + (a.joinphrase || '')).join('')
			console.log(`    [${rec.score}] ${artists} — ${rec.title}`)
			if (rec.releases?.[0]) {
				console.log(`           Release: ${rec.releases[0].title} (${rec.releases[0].date || '?'})`)
			}
		}

		return {recording: data.recordings[0], searchDescription: strategy.description, parsed}
	}
	return null
}

// — Run —

const testTitle = 'Artery · Afterwards (7" Version)'

console.log('=== MusicBrainz Pipeline Test ===')
console.log(`Input:   "${testTitle}"`)

const parsed = parseTitle(testTitle)
console.log(`Cleaned: "${cleanTitle(testTitle)}"`)
console.log(`Artist:  ${parsed.artist ?? '(none)'}`)
console.log(`Title:   ${parsed.title}`)

const result = await search(testTitle)
console.log(result ? `\nBest match via: ${result.searchDescription}` : '\nNo results found.')
