// One lock for the bench and the order test: both drive the same Chrome and build
// previews on fixed ports, so any two of them running at once void each other.
import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

// In tmp, not the checkout: runs from other worktrees share the same Chrome
export function lock(who: 'bench' | 'order test') {
	const file = join(tmpdir(), 'r4-bench.lock')
	const [pidLine, holder = 'bench'] = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : []
	const pid = Number(pidLine) || 0
	const alive = pid > 0 && spawnSync('kill', ['-0', String(pid)]).status === 0
	if (alive)
		throw new Error(
			`another bench or order test is running (${holder}, pid ${pid}); wait for it, they'd skew each other`
		)
	writeFileSync(file, `${process.pid}\n${who}`)
	process.on('exit', () => rmSync(file, {force: true}))
}
