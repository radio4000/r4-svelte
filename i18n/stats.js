#!/usr/bin/env node
/**
 * Print per-locale translation coverage.
 *
 * Usage:
 *   node i18n/stats.js        # all locales
 *   node i18n/stats.js da     # one locale
 */
import {resolveLocales, readLocale, missingKeys, enKeys} from './lib.js'

const locales = resolveLocales(process.argv[2])
const total = enKeys.length
let totalMissing = 0

for (const locale of locales) {
	const missing = Object.keys(missingKeys(readLocale(locale))).length
	const translated = total - missing
	const pct = Math.round((translated / total) * 100)
	console.log(`  ${locale}\t${translated}/${total} (${pct}%)\t${missing} missing`)
	totalMissing += missing
}

if (locales.length > 1) {
	console.log(`\n  ${totalMissing} untranslated across ${locales.length} locales`)
}
