#!/usr/bin/env node
/**
 * Extract untranslated keys as a batch JSON to stdout.
 *
 * Usage:
 *   node i18n/extract.js       # all locales
 *   node i18n/extract.js da    # one locale
 */
import {resolveLocales, readLocale, missingKeys} from './lib.js'

const locales = resolveLocales(process.argv[2])
const translations = {}

for (const locale of locales) {
	const missing = missingKeys(readLocale(locale))
	if (Object.keys(missing).length > 0) {
		translations[locale] = missing
	}
}

const payload = {
	source_locale: 'en',
	notes: 'Replace English values with translations. Keep all {placeholders} unchanged.',
	translations
}

process.stdout.write(JSON.stringify(payload, null, '\t') + '\n')
