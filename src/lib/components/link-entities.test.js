import {describe, expect, test} from 'vitest'

// Simple function to test the text parsing logic without Svelte component complexity
/** @param {any} text @param {{slug: string} | null} [track] */
function createLinkedParts(text, track = null) {
	if (typeof text !== 'string') return [{type: 'text', content: ''}]
	if (!text) return [{type: 'text', content: ''}]

	const parts = []
	let lastIndex = 0

	text.replace(
		/(^|\s)([#﹟＃@][\p{XID_Continue}\p{Extended_Pictographic}\p{Emoji_Component}_+-]+)/giu,
		(match, prefix, entity, offset) => {
			// Add text before the match
			if (offset > lastIndex) {
				parts.push({type: 'text', content: text.slice(lastIndex, offset)})
			}

			// Add the prefix as text
			if (prefix) {
				parts.push({type: 'text', content: prefix})
			}

			// Add the entity as a link
			const searchQuery = entity.startsWith('@') ? entity : track?.slug ? `@${track.slug} ${entity}` : entity

			parts.push({
				type: 'link',
				content: entity,
				href: `/search?search=${encodeURIComponent(searchQuery)}`
			})

			lastIndex = offset + match.length
			return match
		}
	)

	// Add remaining text
	if (lastIndex < text.length) {
		parts.push({type: 'text', content: text.slice(lastIndex)})
	}

	return parts.length ? parts : [{type: 'text', content: text}]
}

// Helper to convert parts back to HTML for easier testing
function partsToHtml(parts) {
	return parts
		.map((part) => (part.type === 'link' ? `<a href="${part.href}">${part.content}</a>` : part.content))
		.join('')
}

describe('link-entities', () => {
	test('converts hashtags to search links with channel context', () => {
		const track = {slug: 'oskar'}
		const parts = createLinkedParts('Check out this #techno track', track)
		const result = partsToHtml(parts)
		expect(result).toBe('Check out this <a href="/search?search=%40oskar%20%23techno">#techno</a> track')
	})

	test('converts hashtags without track context', () => {
		const parts = createLinkedParts('Check out this #techno track')
		const result = partsToHtml(parts)
		expect(result).toBe('Check out this <a href="/search?search=%23techno">#techno</a> track')
	})

	test('converts mentions to search links', () => {
		const parts = createLinkedParts('From @oskar channel')
		const result = partsToHtml(parts)
		expect(result).toBe('From <a href="/search?search=%40oskar">@oskar</a> channel')
	})

	test('handles multiple entities in one text', () => {
		const track = {slug: 'oskar'}
		const parts = createLinkedParts('Great #house track from @radio4000 with #electronic vibes', track)
		const result = partsToHtml(parts)
		expect(result).toBe(
			'Great <a href="/search?search=%40oskar%20%23house">#house</a> track from <a href="/search?search=%40radio4000">@radio4000</a> with <a href="/search?search=%40oskar%20%23electronic">#electronic</a> vibes'
		)
	})

	test('handles entities at start of text', () => {
		const parts = createLinkedParts('#techno beats')
		const result = partsToHtml(parts)
		expect(result).toBe('<a href="/search?search=%23techno">#techno</a> beats')
	})

	test('handles hyphenated entities', () => {
		const track = {slug: 'dj-mix'}
		const parts = createLinkedParts('Love this #deep-house track', track)
		const result = partsToHtml(parts)
		expect(result).toBe('Love this <a href="/search?search=%40dj-mix%20%23deep-house">#deep-house</a> track')
	})

	test('handles empty or null text', () => {
		expect(partsToHtml(createLinkedParts(''))).toBe('')
		expect(partsToHtml(createLinkedParts(null))).toBe('')
		expect(partsToHtml(createLinkedParts(undefined))).toBe('')
	})

	test('handles non-string input', () => {
		expect(partsToHtml(createLinkedParts(123))).toBe('')
		expect(partsToHtml(createLinkedParts({}))).toBe('')
	})

	test('preserves text without entities', () => {
		const text = 'Just a regular track description'
		const parts = createLinkedParts(text)
		const result = partsToHtml(parts)
		expect(result).toBe(text)
	})

	test('case insensitive matching', () => {
		const track = {slug: 'MyChannel'}
		const parts = createLinkedParts('Love #TECHNO and @OSKAR', track)
		const result = partsToHtml(parts)
		expect(result).toBe(
			'Love <a href="/search?search=%40MyChannel%20%23TECHNO">#TECHNO</a> and <a href="/search?search=%40OSKAR">@OSKAR</a>'
		)
	})

	test('handles malicious content safely', () => {
		const track = {slug: 'test'}
		const parts = createLinkedParts('Track with <script>alert("xss")</script> #techno', track)
		const result = partsToHtml(parts)
		// The <script> tag should be preserved as plain text, not executed
		expect(result).toBe(
			'Track with <script>alert("xss")</script> <a href="/search?search=%40test%20%23techno">#techno</a>'
		)
		// Test that the parts are correctly separated
		expect(parts.some((p) => p.type === 'text' && p.content.includes('<script>'))).toBe(true)
	})

	test('handles complex real-world hashtag example', () => {
		const track = {slug: 'seance-centre'}
		const text = '#am #pm blend #new-wave #dub #disco #jazz on #séance-centre'
		const parts = createLinkedParts(text, track)
		const result = partsToHtml(parts)

		expect(result).toBe(
			'<a href="/search?search=%40seance-centre%20%23am">#am</a> <a href="/search?search=%40seance-centre%20%23pm">#pm</a> blend <a href="/search?search=%40seance-centre%20%23new-wave">#new-wave</a> <a href="/search?search=%40seance-centre%20%23dub">#dub</a> <a href="/search?search=%40seance-centre%20%23disco">#disco</a> <a href="/search?search=%40seance-centre%20%23jazz">#jazz</a> on <a href="/search?search=%40seance-centre%20%23s%C3%A9ance-centre">#séance-centre</a>'
		)

		// Verify we have the correct number of links and text parts
		const linkParts = parts.filter((p) => p.type === 'link')
		const textParts = parts.filter((p) => p.type === 'text')
		expect(linkParts).toHaveLength(7) // 7 hashtags
		expect(textParts.length).toBeGreaterThan(0) // Text between hashtags

		// Check that special characters in hashtags are handled
		const accentedHashtag = linkParts.find((p) => p.content === '#séance-centre')
		expect(accentedHashtag).toBeDefined()
		expect(accentedHashtag?.href).toContain('%C3%A9') // URL-encoded é
	})

	test('handles creative Unicode hashtags', () => {
		const track = {slug: 'radio4000'}
		const text = 'Amazing #🎵techno and #deep_house plus some #tech+house vibes'
		const parts = createLinkedParts(text, track)

		const linkParts = parts.filter((p) => p.type === 'link')
		expect(linkParts).toHaveLength(3)

		// Should handle emoji in hashtags
		const emojiHashtag = linkParts.find((p) => p.content === '#🎵techno')
		expect(emojiHashtag).toBeDefined()

		// Should handle underscores
		const underscoreHashtag = linkParts.find((p) => p.content === '#deep_house')
		expect(underscoreHashtag).toBeDefined()

		// Should handle plus signs
		const plusHashtag = linkParts.find((p) => p.content === '#tech+house')
		expect(plusHashtag).toBeDefined()
	})

	test('handles alternative hash symbols', () => {
		const track = {slug: 'test'}
		const text = 'Regular #hash and fullwidth ＃fullwidth and small ﹟small'
		const parts = createLinkedParts(text, track)
		const linkParts = parts.filter((p) => p.type === 'link')

		expect(linkParts).toHaveLength(3)
		expect(linkParts.map((p) => p.content)).toEqual(['#hash', '＃fullwidth', '﹟small'])
	})
})
