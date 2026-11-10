import {describe, expect, test} from 'vitest'
import {findTokens} from '@radio4000/sdk'

// The component links each token findTokens returns; these pin what counts as one.
const linked = (text) => findTokens(text).map((t) => text.slice(t.start, t.end))

describe('link-entities tokens', () => {
	test('tags and mentions, as written', () => {
		expect(linked('Great #House track from @radio4000 with #electronic vibes')).toEqual([
			'#House',
			'@radio4000',
			'#electronic'
		])
	})

	test('at the start, after punctuation, and with accents', () => {
		expect(linked('#techno beats (#uk) "#séance-centre"')).toEqual([
			'#techno',
			'#uk',
			'#séance-centre'
		])
	})

	test('trailing punctuation stays outside the link', () => {
		expect(linked('thx @ko002! #acid, #house.')).toEqual(['@ko002', '#acid', '#house'])
	})

	test('links, emails and HTML entities are not tags or mentions', () => {
		expect(
			linked('see https://x.com/page#top or info@shop.com &#39; youtube.com/@ko002/videos')
		).toEqual([])
	})

	test("a mention is a slug, so @alice's links @alice", () => {
		expect(linked("@alice's mix")).toEqual(['@alice'])
	})

	test('underscores, plus and emoji', () => {
		expect(linked('#deep_house #tech+house #🎵techno')).toEqual([
			'#deep_house',
			'#tech+house',
			'#🎵techno'
		])
	})

	test('plain text and empty input have none', () => {
		expect(linked('Just a regular track description')).toEqual([])
		expect(findTokens('')).toEqual([])
		expect(findTokens(null)).toEqual([])
	})
})
