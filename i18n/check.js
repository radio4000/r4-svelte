#!/usr/bin/env node
/**
 * Reports translation keys where the non-English value still matches the English fallback.
 * Usage: node i18n/check.js
 */
import {readdirSync, readFileSync} from 'fs'
import {join, dirname} from 'path'
import {fileURLToPath} from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const messagesDir = join(__dirname, 'messages')

const enPath = join(messagesDir, 'en.json')
const en = JSON.parse(readFileSync(enPath, 'utf8'))

const files = readdirSync(messagesDir).filter((f) => f.endsWith('.json') && f !== 'en.json')

let totalUntranslated = 0

for (const file of files) {
	const path = join(messagesDir, file)
	const lang = JSON.parse(readFileSync(path, 'utf8'))
	const untranslated = Object.entries(lang)
		.filter(([key, val]) => key !== '$schema' && val === en[key])
		.map(([key]) => key)
	if (untranslated.length > 0) {
		console.log(`${file}: ${untranslated.length} untranslated`)
		totalUntranslated += untranslated.length
	}
}

if (totalUntranslated === 0) {
	console.log('All keys translated in all languages')
} else {
	console.log(`\nTotal: ${totalUntranslated} untranslated keys across all languages`)
}
