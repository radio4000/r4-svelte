/** Patch generated paraglide files that trip up svelte-check. */
import {readdirSync, readFileSync, writeFileSync} from 'fs'
import {join} from 'path'

const dir = 'src/lib/paraglide/messages'
for (const name of readdirSync(dir)) {
	if (!name.endsWith('.js')) continue
	const file = join(dir, name)
	let src = readFileSync(file, 'utf8')
	let changed = false
	if (!src.startsWith('// @ts-nocheck')) {
		src = '// @ts-nocheck\n' + src
		changed = true
	}
	// Escape @{ inside JSDoc comments — the parser reads it as a malformed inline tag.
	if (src.includes('@{')) {
		src = src.replaceAll('@{', '@\\{')
		changed = true
	}
	if (changed) writeFileSync(file, src)
}
