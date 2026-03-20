/** Prepend // @ts-nocheck to generated paraglide files that trip up svelte-check. */
import {readdirSync, readFileSync, writeFileSync} from 'fs'
import {join} from 'path'

const dir = 'src/lib/paraglide/messages'
for (const name of readdirSync(dir)) {
	if (!name.endsWith('.js')) continue
	const file = join(dir, name)
	const src = readFileSync(file, 'utf8')
	if (!src.startsWith('// @ts-nocheck')) {
		writeFileSync(file, '// @ts-nocheck\n' + src)
	}
}
