#!/usr/bin/env node
/**
 * Extract untranslated keys + flag suspicious existing translations.
 *
 * Usage:
 *   node i18n/review.js       # all locales
 *   node i18n/review.js da    # one locale
 *
 * Heuristics: placeholder mismatches, extreme length ratios, identical to another locale.
 */
import {
	resolveLocales,
	readLocale,
	missingKeys,
	en,
	enKeys,
	placeholderNames,
	localeFiles
} from './lib.js'

const locales = resolveLocales(process.argv[2])

// Load all locales for cross-locale comparison
const allLocaleData = {}
for (const f of localeFiles) {
	const code = f.replace(/\.json$/, '')
	allLocaleData[code] = readLocale(code)
}

const translations = {}
const review = {}

for (const locale of locales) {
	const localeData = allLocaleData[locale]

	// Missing keys
	const missing = missingKeys(localeData)
	if (Object.keys(missing).length > 0) {
		translations[locale] = missing
	}

	// Review existing translations
	const flags = {}
	for (const key of enKeys) {
		const value = localeData[key]
		if (value === undefined || value === en[key]) continue

		const issues = []
		const enValue = en[key]

		// Placeholder mismatch
		const enPh = placeholderNames(enValue)
		const localePh = placeholderNames(value)
		if (enPh.size !== localePh.size || [...enPh].some((p) => !localePh.has(p))) {
			issues.push(
				`placeholder mismatch: expected {${[...enPh].join(', ')}} got {${[...localePh].join(', ')}}`
			)
		}

		// Length ratio (strings > 10 chars)
		if (enValue.length > 10) {
			const ratio = value.length / enValue.length
			if (ratio < 0.3) issues.push(`suspiciously short (${Math.round(ratio * 100)}% of English)`)
			if (ratio > 3.0) issues.push(`suspiciously long (${Math.round(ratio * 100)}% of English)`)
		}

		// Identical to another locale
		for (const [otherLocale, otherData] of Object.entries(allLocaleData)) {
			if (otherLocale === locale) continue
			if (otherData[key] === value) {
				issues.push(`identical to ${otherLocale}`)
				break
			}
		}

		if (issues.length > 0) {
			flags[key] = {value, english: enValue, issues}
		}
	}

	if (Object.keys(flags).length > 0) {
		review[locale] = flags
	}
}

const payload = {
	source_locale: 'en',
	notes:
		'Translate missing keys in "translations". Check flagged issues in "review" — fix or ignore.',
	translations,
	review
}

process.stdout.write(JSON.stringify(payload, null, '\t') + '\n')
