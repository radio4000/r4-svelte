/** Prepend // @ts-nocheck to generated paraglide files that trip up svelte-check. */
import {readFileSync, writeFileSync} from 'fs'

const file = 'src/lib/paraglide/messages/_index.js'
const src = readFileSync(file, 'utf8')
if (!src.startsWith('// @ts-nocheck')) {
	writeFileSync(file, '// @ts-nocheck\n' + src)
}
