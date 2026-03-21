#!/usr/bin/env node
/**
 * Validate locale parity against English.
 *
 * Fails when a locale:
 * - is missing keys present in English
 * - contains extra keys not present in English
 * - has placeholder names that differ from English
 *
 * Usage:
 *   node i18n/check.js
 *   node i18n/check.js da
 */
import {resolveLocales, readLocale, en, enKeys, placeholderNames} from './lib.js'

const locales = resolveLocales(process.argv[2])
let hasErrors = false

for (const locale of locales) {
	const localeData = readLocale(locale)
	const localeKeys = Object.keys(localeData).filter((k) => k !== '$schema')

	const missing = enKeys.filter((key) => !(key in localeData))
	const extra = localeKeys.filter((key) => !(key in en))
	const placeholderIssues = []

	for (const key of enKeys) {
		if (!(key in localeData)) continue
		const expected = placeholderNames(en[key])
		const actual = placeholderNames(localeData[key])
		if (expected.size !== actual.size || [...expected].some((name) => !actual.has(name))) {
			placeholderIssues.push({
				key,
				expected: [...expected].toSorted(),
				actual: [...actual].toSorted()
			})
		}
	}

	if (missing.length === 0 && extra.length === 0 && placeholderIssues.length === 0) {
		console.log(`  ${locale}\tok`)
		continue
	}

	hasErrors = true
	console.log(`  ${locale}\tfailed`)
	if (missing.length > 0) {
		console.log(`    missing keys (${missing.length}): ${missing.join(', ')}`)
	}
	if (extra.length > 0) {
		console.log(`    extra keys (${extra.length}): ${extra.join(', ')}`)
	}
	if (placeholderIssues.length > 0) {
		console.log(`    placeholder mismatches (${placeholderIssues.length}):`)
		for (const issue of placeholderIssues) {
			console.log(
				`      ${issue.key}: expected {${issue.expected.join(', ')}} got {${issue.actual.join(', ')}}`
			)
		}
	}
}

if (hasErrors) {
	process.exit(1)
}
