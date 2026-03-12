#!/usr/bin/env node
/**
 * Remove unused message keys from en.json by scanning src/ for m.key() usage.
 *
 * Usage:
 *   node i18n/prune-unused.js --dry-run
 *   node i18n/prune-unused.js
 *
 * Notes:
 * - This only detects the standard `m.key()` call pattern used in the app.
 * - After pruning English, run `bun run i18n` to remove orphaned keys from other locales.
 */
import {readdirSync, readFileSync, writeFileSync} from 'fs'
import {join, dirname, extname} from 'path'
import {fileURLToPath} from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const srcDir = join(rootDir, 'src')
const enPath = join(__dirname, 'messages', 'en.json')
const dryRun = process.argv.includes('--dry-run')

const exts = new Set(['.svelte', '.js', '.ts'])
const usageRegex = /\bm\.([a-zA-Z0-9_]+)\(/g

function walk(dir) {
	const files = []
	for (const entry of readdirSync(dir, {withFileTypes: true})) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			files.push(...walk(full))
			continue
		}
		if (exts.has(extname(entry.name))) {
			files.push(full)
		}
	}
	return files
}

const usedKeys = new Set()
for (const file of walk(srcDir)) {
	const content = readFileSync(file, 'utf8')
	for (const match of content.matchAll(usageRegex)) {
		usedKeys.add(match[1])
	}
}

const en = JSON.parse(readFileSync(enPath, 'utf8'))
const unusedKeys = Object.keys(en)
	.filter((key) => key !== '$schema' && !usedKeys.has(key))
	.sort()

if (unusedKeys.length === 0) {
	console.log('No unused English message keys found')
	process.exit(0)
}

console.log(`Found ${unusedKeys.length} unused English message keys`)
for (const key of unusedKeys) {
	console.log(`  ${key}`)
}

if (dryRun) {
	process.exit(0)
}

for (const key of unusedKeys) {
	delete en[key]
}

const sorted = Object.fromEntries(Object.entries(en).sort(([a], [b]) => a.localeCompare(b)))
writeFileSync(enPath, JSON.stringify(sorted, null, '\t') + '\n')
console.log(`\nRemoved ${unusedKeys.length} keys from en.json`)
