#!/usr/bin/env node
/**
 * Extract untranslated keys (value identical to English) into a batch JSON.
 *
 * Usage:
 *   node i18n/extract-batch.js [output-file.json]
 *
 * If no output path is provided, prints JSON to stdout.
 */
import {readdirSync, readFileSync, writeFileSync} from 'fs'
import {join, dirname, resolve} from 'path'
import {fileURLToPath} from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const messagesDir = join(__dirname, 'messages')

const enPath = join(messagesDir, 'en.json')
const en = JSON.parse(readFileSync(enPath, 'utf8'))

const localeFiles = readdirSync(messagesDir)
	.filter((f) => f.endsWith('.json') && f !== 'en.json')
	.sort()

const translations = {}
let total = 0

for (const file of localeFiles) {
	const locale = file.replace(/\.json$/, '')
	const localePath = join(messagesDir, file)
	const localeData = JSON.parse(readFileSync(localePath, 'utf8'))

	const missing = {}
	for (const [key, enValue] of Object.entries(en)) {
		if (key === '$schema') continue
		if (!(key in localeData) || localeData[key] === enValue) {
			missing[key] = enValue
		}
	}

	if (Object.keys(missing).length > 0) {
		translations[locale] = missing
		total += Object.keys(missing).length
	}
}

const payload = {
	created_at: new Date().toISOString(),
	source_locale: 'en',
	notes: 'Replace English placeholders with target translations and keep all {placeholders} unchanged.',
	translations
}

const json = JSON.stringify(payload, null, '\t') + '\n'
const outputPath = process.argv[2]

if (outputPath) {
	const absoluteOutput = resolve(process.cwd(), outputPath)
	writeFileSync(absoluteOutput, json)
	console.log(`Wrote batch template: ${absoluteOutput}`)
} else {
	process.stdout.write(json)
}

console.error(`Locales with untranslated keys: ${Object.keys(translations).length}`)
console.error(`Total untranslated keys: ${total}`)
