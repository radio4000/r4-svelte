#!/usr/bin/env node
/**
 * Apply a translation batch JSON to locale message files.
 *
 * Usage:
 *   node i18n/apply-batch.js i18n/batches/2026-03.json
 */
import {readFileSync, writeFileSync, existsSync} from 'fs'
import {join, dirname, resolve} from 'path'
import {fileURLToPath} from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const messagesDir = join(__dirname, 'messages')
const placeholderRegex = /\{([a-zA-Z0-9_]+)\}/g

const batchPath = process.argv[2]
if (!batchPath) {
	console.error('Missing batch file path. Usage: node i18n/apply-batch.js <batch-file.json>')
	process.exit(1)
}

const absoluteBatchPath = resolve(process.cwd(), batchPath)
if (!existsSync(absoluteBatchPath)) {
	console.error(`Batch file not found: ${absoluteBatchPath}`)
	process.exit(1)
}

const enPath = join(messagesDir, 'en.json')
const en = JSON.parse(readFileSync(enPath, 'utf8'))

const batch = JSON.parse(readFileSync(absoluteBatchPath, 'utf8'))
const translations = batch.translations

if (!translations || typeof translations !== 'object' || Array.isArray(translations)) {
	console.error('Invalid batch format: expected top-level object with `translations` map')
	process.exit(1)
}

const placeholderNames = (value) => {
	const matches = [...String(value ?? '').matchAll(placeholderRegex)]
	return new Set(matches.map((m) => m[1]))
}

const samePlaceholders = (a, b) => {
	if (a.size !== b.size) return false
	for (const v of a) {
		if (!b.has(v)) return false
	}
	return true
}

let updatedLocales = 0
let updatedValues = 0

for (const [locale, localeTranslations] of Object.entries(translations)) {
	if (
		!localeTranslations ||
		typeof localeTranslations !== 'object' ||
		Array.isArray(localeTranslations)
	) {
		console.error(`Invalid translations for locale ${locale}: expected object`)
		process.exit(1)
	}

	const localePath = join(messagesDir, `${locale}.json`)
	if (!existsSync(localePath)) {
		console.error(`Locale file not found: ${localePath}`)
		process.exit(1)
	}

	const localeData = JSON.parse(readFileSync(localePath, 'utf8'))
	let localeChanges = 0

	for (const [key, translatedValue] of Object.entries(localeTranslations)) {
		if (!(key in en)) {
			console.error(`Unknown key in batch (${locale}): ${key}`)
			process.exit(1)
		}
		if (typeof translatedValue !== 'string') {
			console.error(`Invalid value for ${locale}.${key}: expected string`)
			process.exit(1)
		}

		const enPlaceholders = placeholderNames(en[key])
		const translatedPlaceholders = placeholderNames(translatedValue)
		if (!samePlaceholders(enPlaceholders, translatedPlaceholders)) {
			console.error(
				`Placeholder mismatch in ${locale}.${key}: expected {${[...enPlaceholders].join(', ')}} got {${[
					...translatedPlaceholders
				].join(', ')}}`
			)
			process.exit(1)
		}

		if (localeData[key] !== translatedValue) {
			localeData[key] = translatedValue
			localeChanges++
		}
	}

	if (localeChanges > 0) {
		const sorted = Object.fromEntries(
			Object.entries(localeData).sort(([a], [b]) => a.localeCompare(b))
		)
		writeFileSync(localePath, JSON.stringify(sorted, null, '\t') + '\n')
		updatedLocales++
		updatedValues += localeChanges
		console.log(`${locale}.json: ${localeChanges} updated`)
	}
}

if (updatedValues === 0) {
	console.log('No translation changes applied')
} else {
	console.log(`\nApplied ${updatedValues} updates across ${updatedLocales} locale files`)
}
