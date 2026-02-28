#!/usr/bin/env node
/**
 * Syncs translation files with en.json as source of truth.
 * - Removes orphaned keys not in English (does NOT add missing keys — paraglide falls back to en)
 * - Sorts keys alphabetically
 * To get a batch of untranslated keys for translation, run: node i18n/extract-batch.js
 */
import {readdirSync, readFileSync, writeFileSync} from 'fs'
import {join, dirname} from 'path'
import {fileURLToPath} from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const messagesDir = join(__dirname, 'messages')

const enPath = join(messagesDir, 'en.json')
const en = JSON.parse(readFileSync(enPath, 'utf8'))
const enKeys = new Set(Object.keys(en))

// Sort en.json too
const enSorted = Object.fromEntries(Object.entries(en).sort(([a], [b]) => a.localeCompare(b)))
writeFileSync(enPath, JSON.stringify(enSorted, null, '\t') + '\n')

const files = readdirSync(messagesDir).filter((f) => f.endsWith('.json') && f !== 'en.json')

let totalRemoved = 0

for (const file of files) {
	const path = join(messagesDir, file)
	const lang = JSON.parse(readFileSync(path, 'utf8'))
	const langKeys = new Set(Object.keys(lang))

	const orphaned = [...langKeys].filter((key) => !enKeys.has(key))

	if (orphaned.length === 0) continue

	// Remove orphaned keys
	for (const key of orphaned) {
		delete lang[key]
	}

	// Sort keys alphabetically
	const sorted = Object.fromEntries(Object.entries(lang).sort(([a], [b]) => a.localeCompare(b)))

	writeFileSync(path, JSON.stringify(sorted, null, '\t') + '\n')

	console.log(`${file}: -${orphaned.length}`)
	totalRemoved += orphaned.length
}

if (totalRemoved === 0) {
	console.log('All languages in sync')
} else {
	console.log(`\n${totalRemoved} orphaned keys removed`)
}
