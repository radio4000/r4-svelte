/* eslint-disable e18e/prefer-static-regex */
import {businessPartners, spamDomains, spamKeywords, suspiciousPhrases} from './spam-words'

// Domains/providers that indicate a track actually points at music, not a marketing site
const musicProviderPattern =
	/(youtube\.com|youtu\.be|soundcloud\.com|bandcamp\.com|mixcloud\.com|vimeo\.com|spotify\.com|discogs\.com|dailymotion\.com|archive\.org)/i
const audioFileExtensionPattern = /\.(mp3|wav|flac|ogg|m4a|aac)(\?|$)/i

function isMusicUrl(url) {
	if (!url) return true // no url, nothing to flag
	return musicProviderPattern.test(url) || audioFileExtensionPattern.test(url)
}

function hostnameOf(url) {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return url
	}
}

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
 * @param {{name?: string | null, slug?: string | null, description?: string | null, created_at?: string | null}} channel
 * @param {Array<import('#lib/types.js').Track>} [tracks] - Optional track data for enhanced analysis
 * @returns {{isSpam: boolean, confidence: number, reasons: string[], evidence: {keywords: string[], phrases: string[], locations: string[], patterns: string[], musicTerms: string[], trackSignals: string[]}}}
 */
export function analyzeChannel(channel, tracks = []) {
	const reasons = []
	let spamScore = 0

	const title = (channel.name || '').toLowerCase()
	const description = (channel.description || '').toLowerCase()
	const text = `${title} ${description}`

	// Evidence collectors
	/** @type {{keywords: string[], phrases: string[], locations: string[], patterns: string[], musicTerms: string[], trackSignals: string[]}} */
	const evidence = {
		keywords: [],
		phrases: [],
		locations: [],
		patterns: [],
		musicTerms: [],
		trackSignals: []
	}

	// Check for music terms (counter-evidence) — word boundaries to avoid "rap" in "photography" etc.
	const foundMusicTerms = musicTerms.filter((term) => {
		const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		return new RegExp(`\\b${escaped}\\b`).test(text)
	})
	evidence.musicTerms = foundMusicTerms
	const musicTermBonus = Math.min(foundMusicTerms.length * 4, 8)

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
		reasons.push(
			`Spam keywords: ${matchedKeywords.slice(0, 3).join(', ')}${matchedKeywords.length > 3 ? '...' : ''}`
		)
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
	if (
		/\w+\d+$/.test(title) &&
		title.length > 5 &&
		!/(radio|rádio|dj|tdj|\d{4}|3000|2000|4000|fm|am)/i.test(title)
	) {
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
	if (
		/^[A-Z]\d{1,3}$/i.test(title) ||
		/^(BK|W)\d+$/i.test(title) ||
		/ratubola|ratuBola/i.test(title)
	) {
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
		const isMusicNumbers =
			/(19\d{2}|20\d{2}|\d{4})/i.test(text) || /(radio|rádio|dj|music|track|album|mix)/i.test(text)
		if (!isMusicNumbers) {
			spamScore += 1 // Increased from 0.5
			reasons.push('Contains number codes/phones')
		}
	}

	// Multiple business/promotional terms together (combo detection)
	const businessTermCount = [
		'service',
		'company',
		'business',
		'professional',
		'expert',
		'specialist'
	].filter((term) => text.includes(term)).length

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

	// Name-based business signals. On a curation platform the channel *name* is the
	// richest tell — real channels are named like radios/artists, spam like a business.
	// Match the name plus the de-slugged handle so hyphenated slugs still resolve to words.
	const slugWords = (channel.slug || '').replace(/[-_]+/g, ' ').toLowerCase()
	// Strip digits glued to a word end so bulk-registered dupes ("…llp0", "…solutions1",
	// "…inspections2") still resolve to their base token.
	const nameText = `${title} ${slugWords}`.replace(/([a-z])\d+\b/gi, '$1')

	// Legal-entity suffixes — a music channel practically never carries one.
	if (/\b(llc|llp|pllc|inc|ltd|corp|gmbh|pty|pvt\.? ?ltd|s\.?r\.?l|plc)\b/i.test(nameText)) {
		spamScore += 10
		evidence.keywords.push('legal-entity')
		reasons.push('Business legal-entity suffix in name')
	}

	// High-precision service/trade terms in the name (incl. plural/glued variants).
	const professionPattern =
		/\b(law|lawyer|lawyers|attorney|attorneys|solicitor|plumb(?:ing|er|ers)|roof(?:ing|er|ers)|hvac|heating|cooling|fuels|chiropract\w*|dentist\w*|dental|orthodont\w*|denture\w*|contractor|construction|remodel\w*|renovation|landscap\w*|lawn\s?care|cleaning|power\s?washing|pressure\s?(?:washing|cleaning)|painting|painters?|locksmith|realty|real\s?estate|mortgage|insurance|dermatolog\w*|carpentry|flooring|electric(?:ian)|handyman|movers?|nursery|foundation\s?(?:repair|solutions)|inspections?|pest\s?control|junk\s?removal|towing|septic|excavat\w*|concrete|fencing|welding|detailing|countertops?|cabinets?|restoration|waterproofing|gutter|siding|drywall|masonry)\b/i
	if (professionPattern.test(nameText)) {
		spamScore += 10
		evidence.keywords.push('business-name')
		reasons.push('Service-business term in channel name')
	}

	// Corporate name suffixes (…Solutions, …Group, …Institute).
	if (
		/\b(solutions|group|services|advisory|institute|academy|centre|clinic|agency|consulting|consultancy|enterprises|holdings|ventures|associates|logistics|foodservice|healthcare)\s*\d*$/i.test(
			title.trim()
		)
	) {
		spamScore += 6
		evidence.keywords.push('corp-suffix')
		reasons.push('Corporate suffix in name')
	}

	// Gambling / betting brand slugs — an entire spam vector of their own.
	if (
		/\b(918kiss|kiss918|mega888|pussy888|sc88|w88|fun88|bk8|sbobet|ufabet|188bet|togel|gacor|gclub|baccarat|joker(?:123|388)?|jili\w*|lyrabet|diuwin|wazamba|sportaza|pragmatic ?play)\b/i.test(
			nameText
		)
	) {
		spamScore += 10
		evidence.keywords.push('gambling')
		reasons.push('Gambling/betting brand pattern')
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

	spamScore = Math.max(0, spamScore - legitimacyBonus - musicTermBonus)

	// Structural track signals dominate — a channel's own words are easy to spoof,
	// but where its tracks actually point to is not.
	let structuralScore = 0
	const trackCountTotal = tracks.length

	if (trackCountTotal > 0) {
		const nonMusicTracks = tracks.filter((track) => !isMusicUrl(track.url))
		if (nonMusicTracks.length > 0) {
			const nonMusicFraction = nonMusicTracks.length / trackCountTotal
			structuralScore += nonMusicFraction * 12
			evidence.trackSignals.push(`${nonMusicTracks.length}/${trackCountTotal} non-music urls`)
			reasons.push(`Non-music track urls (${nonMusicTracks.length}/${trackCountTotal})`)

			const offendingDomains = [...new Set(nonMusicTracks.map((t) => hostnameOf(t.url)))]
			evidence.trackSignals.push(...offendingDomains.slice(0, 3))
		}

		const discogsMatchTracks = tracks.filter(
			(track) =>
				track.url &&
				track.discogs_url &&
				track.url === track.discogs_url &&
				!/discogs\.com/i.test(track.url)
		)
		if (discogsMatchTracks.length > 0) {
			structuralScore += 10
			evidence.trackSignals.push('url = discogs_url')
			reasons.push(`Track url equals discogs_url (${discogsMatchTracks.length})`)
		}

		const longDescriptionTracks = tracks.filter((track) => (track.description?.length ?? 0) > 300)
		if (longDescriptionTracks.length > 0) {
			structuralScore += Math.min(longDescriptionTracks.length, 3) * 4
			evidence.trackSignals.push(`${longDescriptionTracks.length} track(s) with long description`)
			reasons.push(`Long track descriptions (${longDescriptionTracks.length})`)
		}
	}

	spamScore += structuralScore

	// Flag for review if description is unusually long (secondary/medium evidence, not decisive alone)
	const isLongDescription = description.length > 400
	if (isLongDescription) {
		spamScore += 2
		reasons.push('Long channel description')
	}

	const confidence = Math.min(spamScore / 20, 1) // denominator raised so structural signals dominate
	const isSpam = confidence > 0.4

	return {isSpam, confidence, reasons, evidence}
}

/**
 * Add spam analysis to channels and sort by confidence
 * @param {Array<import('#lib/types.js').Channel>} channels
 * @returns {Array<import('#lib/types.js').Channel & {spamAnalysis: {confidence: number, reasons: string[], isSpam: boolean}}>}
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
						evidence: {
							keywords: [],
							phrases: [],
							locations: [],
							patterns: [],
							musicTerms: [],
							trackSignals: []
						}
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
