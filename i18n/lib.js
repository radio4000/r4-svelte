/**
 * Shared helpers for i18n scripts.
 */
import {readdirSync, readFileSync} from 'fs'
import {join, dirname} from 'path'
import {fileURLToPath} from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const messagesDir = join(__dirname, 'messages')

export const en = JSON.parse(readFileSync(join(messagesDir, 'en.json'), 'utf8'))
export const enKeys = Object.keys(en).filter((k) => k !== '$schema')

export const localeFiles = readdirSync(messagesDir)
	.filter((f) => f.endsWith('.json') && f !== 'en.json')
	.sort()

export function readLocale(locale) {
	return JSON.parse(readFileSync(join(messagesDir, `${locale}.json`), 'utf8'))
}

export function resolveLocales(filter) {
	if (!filter) return localeFiles.map((f) => f.replace(jsonExtRegex, ''))
	if (!localeFiles.includes(`${filter}.json`)) {
		console.error(`Locale not found: ${filter}`)
		process.exit(1)
	}
	return [filter]
}

const placeholderRegex = /\{([a-zA-Z0-9_]+)\}/g
const jsonExtRegex = /\.json$/
export const placeholderNames = (v) => new Set(Array.from(String(v ?? '').matchAll(placeholderRegex), (m) => m[1]))

/** Keys missing or still identical to English */
export function missingKeys(localeData) {
	const missing = {}
	for (const key of enKeys) {
		if (!(key in localeData) || localeData[key] === en[key]) {
			missing[key] = en[key]
		}
	}
	return missing
}
