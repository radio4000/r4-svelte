import {businessPartners, spamDomains, spamKeywords, suspiciousPhrases} from './spam-words'

// Music-related terms that suggest legitimacy
const musicTerms = [
	'music',
	'radio',
	'rádio',
	'dj',
	'song',
	'track',
	'album',
	'band',
	'artist',
	'mix',
	'playlist',
	'sound',
	'audio',
	'rock',
	'pop',
	'jazz',
	'blues',
	'electronic',
	'classical',
	'metal',
	'folk',
	'country',
	'hip hop',
	'rap',
	'reggae',
	'latin',
	'dance',
	'disco',
	'funk',
	'soul',
	'r&b',
	'techno',
	'house',
	'ambient',
	'indie',
	'punk',
	'grunge',
	'alternative',
	'acoustic',
	'vinyl',
	'record',
	'beat',
	'rhythm',
	'melody',
	'concert',
	'gig',
	'live',
	'studio',
	'producer',
	'remix'
]

/**
 * Analyze a channel for spam indicators
 * @param {{name?: string, description?: string | null, created_at?: string | null}} channel
 * @param {Array<import('$lib/types').Track>} [tracks] - Optional track data for enhanced analysis
 * @returns {{isSpam: boolean, confidence: number, reasons: string[], evidence: {keywords: string[], phrases: string[], locations: string[], patterns: string[], musicTerms: string[]}}}
 */
export function analyzeChannel(channel, tracks = []) {
	const reasons = []
	let spamScore = 0

	const title = (channel.name || '').toLowerCase()
	const description = (channel.description || '').toLowerCase()
	const text = `${title} ${description}`

	// Evidence collectors
	/** @type {{keywords: string[], phrases: string[], locations: string[], patterns: string[], musicTerms: string[]}} */
	const evidence = {
		keywords: [],
		phrases: [],
		locations: [],
		patterns: [],
		musicTerms: []
	}

	// Check for music terms (counter-evidence)
	const foundMusicTerms = musicTerms.filter((term) => text.includes(term.toLowerCase()))
	evidence.musicTerms = foundMusicTerms

	// Check for spam keywords (increased weight for multiple matches) - use word boundaries for short words
	const matchedKeywords = spamKeywords.filter((keyword) => {
		const lowerKeyword = keyword.toLowerCase()
		// Use word boundaries for short words to avoid partial matches
		if (lowerKeyword.length <= 3) {
			return new RegExp(`\\b${lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)
		}
		return text.includes(lowerKeyword)
	})

	evidence.keywords = matchedKeywords

	if (matchedKeywords.length > 0) {
		spamScore += matchedKeywords.length * 3 // Increased from 2
		reasons.push(`Spam keywords: ${matchedKeywords.slice(0, 3).join(', ')}${matchedKeywords.length > 3 ? '...' : ''}`)
	}

	// Check for business patterns (regex) - but be lenient for music channels
	const matchedPatterns = businessPartners.filter((pattern) => pattern.test(text))
	if (matchedPatterns.length > 0) {
		// Reduce penalty if it looks like a music channel
		const isMusicChannel =
			/(music|radio|rádio|dj|song|track|album|band|artist|mix|playlist|sound|audio|rock|pop|jazz|blues|electronic|classical|metal|folk|country|hip hop|rap|reggae|latin|dance|disco|funk|soul|r&b)/i.test(
				text
			)
		const penalty = isMusicChannel ? matchedPatterns.length * 1 : matchedPatterns.length * 3
		spamScore += penalty
		reasons.push(`Business patterns detected (${matchedPatterns.length})`)
	}

	// Check for suspicious business phrases - increased weight for multiple
	const matchedPhrases = suspiciousPhrases.filter((phrase) => text.includes(phrase.toLowerCase()))
	evidence.phrases = matchedPhrases

	if (matchedPhrases.length > 0) {
		spamScore += matchedPhrases.length * 2 // Increased from 1
		reasons.push(
			`Suspicious phrases: ${matchedPhrases.slice(0, 2).join(', ')}${matchedPhrases.length > 2 ? '...' : ''}`
		)
	}

	// Check for location-based service spam - use word boundaries
	const matchedDomains = spamDomains.filter((domain) => {
		const lowerDomain = domain.toLowerCase()
		// Use word boundaries to avoid partial matches
		return new RegExp(`\\b${lowerDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)
	})
	evidence.locations = matchedDomains

	if (matchedDomains.length > 0) {
		spamScore += matchedDomains.length * 2 // Increased from 1
		reasons.push(`Location indicators: ${matchedDomains.join(', ')}`)
	}

	// Very long descriptions are often spam (especially business spam)
	if (description.length > 500) {
		spamScore += 4 // Increased from 2
		reasons.push('Long description')
	}

	// Location + business type patterns (like "wilmingtonweightlossnc1", "dallasfootanklesu1", "shadeprotxnewbraunfels")
	if (
		/\b[a-z]+[a-z]+(weight|dental|apartment|foot|ankle|electric|bros|auction|clinic|repair|rental|pest|shade|prot|bcew)\w*\d*$/i.test(
			title
		) ||
		/\b[a-z]+(ca|tx|fl|nc|ny)\d*$/i.test(title)
	) {
		spamScore += 4
		reasons.push('Location + business type pattern')
	}

	// Business name ending with numbers (common spam pattern) - exclude music-related numbers
	if (/\w+\d+$/.test(title) && title.length > 5 && !/(radio|rádio|dj|tdj|\d{4}|3000|2000|4000|fm|am)/i.test(title)) {
		spamScore += 3
		reasons.push('Business name with trailing numbers')
	}

	// Domain-like business names (getmodnow, noodlemagazine, etc.)
	if (
		/^(get|buy|find|best|top|the)\w+\.(com|org|net)$/i.test(title.replace(/\s/g, '')) ||
		/^[a-z]+\d{2,4}$/i.test(title) ||
		/^(avtube|getmod|noodle)\w*/i.test(title)
	) {
		spamScore += 3
		reasons.push('Domain-like business name')
	}

	// Gambling/adult site patterns (W69, BK8, etc.)
	if (/^[A-Z]\d{1,3}$/i.test(title) || /^(BK|W)\d+$/i.test(title) || /ratubola|ratuBola/i.test(title)) {
		spamScore += 4
		reasons.push('Gambling/adult site pattern')
	}

	// Obvious business naming patterns
	if (
		/\b(marketing|electric works|centre|academy|clinic|dispensary|group|repairing|rental|locators|removal|weight ?loss|dental|dentist|transmission|mattresses|builders?|pest control|law firm|auto repair|wreckers|enterprises|construction|concierge|weddings|estate agents|therapy|cosmetic surgeon|endodontics|dentures|eye care|barn repair|lawn mowing|tour packages|foodservice|window squad)\b/i.test(
			title
		)
	) {
		spamScore += 4
		reasons.push('Business name indicators')
	}

	// Business-like naming patterns
	if (title.includes(' - ') && (text.includes('service') || text.includes('company'))) {
		spamScore += 2 // Increased from 1
		reasons.push('Business naming pattern')
	}

	// All caps channel names (often spam)
	if (title === title.toUpperCase() && title.length > 3) {
		spamScore += 2 // Increased from 1
		reasons.push('All caps title')
	}

	// Repeated channel name in description (business pattern)
	if (description.includes(channel.name || '')) {
		spamScore += 2 // Increased from 1
		reasons.push('Channel name repeated in description')
	}

	// Multiple sentences with "we" (business marketing speak) - increased weight
	const weCount = (text.match(/\bwe\s+/g) || []).length
	if (weCount > 3) {
		spamScore += 3
		reasons.push(`Heavy use of "we" (${weCount} times)`)
	} else if (weCount > 2) {
		spamScore += 2
		reasons.push(`Frequent use of "we" (${weCount} times)`)
	}

	// Numbers that look like phone numbers or codes - exclude music-related numbers
	if (/\b\d{3,}\b/.test(text)) {
		// Don't penalize years, music terms, or obvious music channels
		const isMusicNumbers = /(19\d{2}|20\d{2}|\d{4})/i.test(text) || /(radio|rádio|dj|music|track|album|mix)/i.test(text)
		if (!isMusicNumbers) {
			spamScore += 1 // Increased from 0.5
			reasons.push('Contains number codes/phones')
		}
	}

	// Multiple business/promotional terms together (combo detection)
	const businessTermCount = ['service', 'company', 'business', 'professional', 'expert', 'specialist'].filter((term) =>
		text.includes(term)
	).length

	if (businessTermCount >= 3) {
		spamScore += 3
		reasons.push(`Multiple business terms (${businessTermCount})`)
	}

	// Check for promotional language density
	const promotionalWords = [
		'best',
		'top',
		'leading',
		'premier',
		'quality',
		'professional',
		'expert',
		'trusted',
		'reliable',
		'affordable'
	]
	const promotionalCount = promotionalWords.filter((word) => text.includes(word)).length

	if (promotionalCount >= 4) {
		spamScore += 3
		reasons.push(`Heavy promotional language (${promotionalCount} terms)`)
	} else if (promotionalCount >= 2) {
		spamScore += 1
		reasons.push(`Promotional language (${promotionalCount} terms)`)
	}

	// Track count legitimacy bonus - channels with many tracks are likely legitimate
	const trackCount = tracks.length
	let legitimacyBonus = 0

	if (trackCount >= 100) {
		legitimacyBonus = 8 // Strong legitimacy signal
		reasons.push(`High track count (${trackCount}) suggests legitimate music channel`)
	} else if (trackCount >= 50) {
		legitimacyBonus = 5
		reasons.push(`Moderate track count (${trackCount}) suggests music channel`)
	} else if (trackCount >= 20) {
		legitimacyBonus = 3
		reasons.push(`Some track activity (${trackCount})`)
	} else if (trackCount >= 10) {
		legitimacyBonus = 1
	}

	spamScore = Math.max(0, spamScore - legitimacyBonus)

	// Analyze tracks if provided
	if (tracks.length > 0) {
		// Check for business-like track titles
		const businessTrackCount = tracks.filter((track) => {
			const title = track.title.toLowerCase()
			return /\b(service|company|business|professional|expert|specialist|repair|rental|clinic|dental|weight ?loss|marketing|electric works|lawn mowing|pest control)\b/i.test(
				title
			)
		}).length

		if (businessTrackCount > 0) {
			spamScore += businessTrackCount * 3
			reasons.push(`Business-like track titles (${businessTrackCount})`)
		}

		// Check for non-music URLs
		const nonMusicUrls = tracks.filter((track) => {
			const url = track.url.toLowerCase()
			// Common business/spam domains vs music platforms
			return (
				!/(youtube|soundcloud|spotify|bandcamp|mixcloud|vimeo|dailymotion)/i.test(url) &&
				/\.(com|org|net|biz)/i.test(url)
			)
		}).length

		if (nonMusicUrls > 0) {
			spamScore += nonMusicUrls * 2
			reasons.push(`Non-music URLs (${nonMusicUrls})`)
		}

		// Check for promotional track content
		const promoTrackCount = tracks.filter((track) => {
			const trackContent = `${track.title} ${track.description || ''}`.toLowerCase()
			return /(call now|contact us|visit our|best price|discount|offer|deal)/i.test(trackContent)
		}).length

		if (promoTrackCount > 0) {
			spamScore += promoTrackCount * 2
			reasons.push(`Promotional track content (${promoTrackCount})`)
		}
	}

	// Flag for review if description is unusually long (even if not clearly spam)
	const isLongDescription = description.length > 400

	const confidence = Math.min(spamScore / 15, 1) // Adjusted denominator for new scoring patterns
	const isSpam = confidence > 0.4 || isLongDescription

	if (isLongDescription && confidence <= 0.4) {
		reasons.push('Long description - flagged for manual review')
	}

	return {isSpam, confidence, reasons, evidence}
}

/**
 * Add spam analysis to channels and sort by confidence
 * @param {Array<import('$lib/types').Channel>} channels
 * @returns {Array<import('$lib/types').Channel & {spamAnalysis: {confidence: number, reasons: string[], isSpam: boolean}}>}
 */
export function analyzeChannels(channels) {
	return channels
		.map((channel) => {
			// If user has already decided to keep this channel, override spam detection
			if (channel.spam === false) {
				return {
					...channel,
					spamAnalysis: {
						isSpam: false,
						confidence: 0,
						reasons: ['Manually marked as legitimate'],
						evidence: {keywords: [], phrases: [], locations: [], patterns: [], musicTerms: []}
					}
				}
			}

			// Run normal spam analysis
			return {
				...channel,
				spamAnalysis: analyzeChannel(channel)
			}
		})
		.sort((a, b) => b.spamAnalysis.confidence - a.spamAnalysis.confidence)
}
