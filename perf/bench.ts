#!/usr/bin/env bun
// Radio4000 benchmark — drives a fixed user journey on a big channel and prints
// per-step timings, so "is it faster?" is a number, not a feeling.
//
//   bun run build && bun run preview          # in another pane (prod build, :4173)
//   bun run bench                             # 1 run (~30s), 4x CPU throttle, /oskar
//   bun run bench --build                     # or: build and serve it itself (:4179, with
//                                             # sourcemaps); also what happens when :4173 is down
//   bun run bench --runs 3                    # medians, for before/after comparisons
//   bun run bench --save-baseline             # remember this run as the baseline
//   bun run bench --ab main --only load:home  # build main next to your code, alternate runs, diff
//   bun run bench --trace channel→tracks      # run up to that step, trace it, list its top functions
//   bun run bench --url https://radio4000.com --runs 5 --cpu 1
//
// agent-browser only launches a muted Chrome (session `r4-bench`); the rest is raw
// CDP, so we can throttle the CPU, wipe storage and record traces. Each run starts
// as a fresh visitor. A step lasts from its action until the page is quiet: no
// fetch in flight, no DOM mutation and no frame over 50ms for QUIET_MS. Spans come
// from window.r5.perf() (src/lib/perf.ts) when the build has them.

/* eslint-disable @typescript-eslint/no-explicit-any -- CDP messages are untyped JSON */
import {parseArgs} from 'node:util'
import {
	mkdirSync,
	writeFileSync,
	readFileSync,
	existsSync,
	rmSync,
	symlinkSync,
	copyFileSync
} from 'node:fs'
import {tmpdir, loadavg, cpus} from 'node:os'
import {join} from 'node:path'
import {TraceMap, originalPositionFor} from '@jridgewell/trace-mapping'

const {values: args} = parseArgs({
	options: {
		url: {type: 'string', default: 'http://localhost:4173'},
		slug: {type: 'string', default: 'oskar'},
		runs: {type: 'string'},
		ab: {type: 'string'},
		top: {type: 'string', default: '12'},
		cpu: {type: 'string', default: '4'},
		only: {type: 'string'},
		trace: {type: 'string'},
		baseline: {type: 'string'},
		'save-baseline': {type: 'boolean', default: false},
		json: {type: 'boolean', default: false},
		build: {type: 'boolean', default: false},
		help: {type: 'boolean', short: 'h', default: false}
	}
})

if (args.help) {
	console.log(
		readFileSync(import.meta.path, 'utf8')
			.split('\n')
			.slice(1, 14)
			.join('\n')
	)
	process.exit(0)
}

const OWN_URL = 'http://localhost:4179'
// How the target was built: 'bench' (our own build, with sourcemaps) or 'external'
let BUILD = 'external'
const STARTED = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
let BASE = args.build ? OWN_URL : args.url!.replace(/\/$/, '')
const SLUG = args.slug!
const RUNS = Number(args.runs ?? (args.ab ? 3 : 1))
const CPU = Number(args.cpu)
const QUIET_MS = 500
const STEP_TIMEOUT_MS = 30_000
// A run takes ~30s on preview; anything near this is stuck, so give up loudly
const RUN_TIMEOUT_MS = 120_000
const RESULTS_DIR = join(import.meta.dir, 'results')
const BASELINE = args.baseline ?? join(RESULTS_DIR, 'baseline.json')

// Progress goes to stderr so --json stays clean on stdout
const log = (msg = '') => (args.json ? console.error : console.log)(msg)

// --- CDP ---------------------------------------------------------------------

async function connect(wsUrl: string) {
	const ws = new WebSocket(wsUrl)
	await new Promise((res, rej) => Object.assign(ws, {onopen: res, onerror: rej}))
	let id = 0
	const calls = new Map<number, {res: (v: any) => void; rej: (e: Error) => void}>()
	const waiters = new Map<string, (params: any) => void>()
	ws.onmessage = (msg) => {
		const m = JSON.parse(String(msg.data))
		if (m.id) {
			const call = calls.get(m.id)
			calls.delete(m.id)
			if (m.error) call?.rej(new Error(`${m.error.message} (${m.error.code})`))
			else call?.res(m.result)
		} else {
			waiters.get(m.method)?.(m.params)
			waiters.delete(m.method)
		}
	}
	return {
		send: <T = any>(method: string, params = {}) =>
			new Promise<T>((res, rej) => {
				calls.set(++id, {res, rej})
				ws.send(JSON.stringify({id, method, params}))
			}),
		once: (event: string) => new Promise<any>((res) => waiters.set(event, res)),
		close: () => ws.close()
	}
}
type Cdp = Awaited<ReturnType<typeof connect>>

async function evaluate<T = any>(cdp: Cdp, expression: string): Promise<T> {
	const r = await cdp.send('Runtime.evaluate', {
		expression,
		awaitPromise: true,
		returnByValue: true
	})
	if (r.exceptionDetails)
		throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
	return r.result.value
}

const ab = (...cmd: string[]) => {
	const p = Bun.spawnSync(['agent-browser', '--session', 'r4-bench', ...cmd])
	if (p.exitCode !== 0) throw new Error(`agent-browser ${cmd.join(' ')}: ${p.stderr}`)
	return p.stdout.toString().trim()
}

async function openPage() {
	// Launch args only apply when the session's browser starts
	ab('--args', '--mute-audio', 'open', 'about:blank')
	const host = new URL(ab('get', 'cdp-url')).host
	const targets: any[] = await (await fetch(`http://${host}/json`)).json()
	const page = targets.find((t) => t.type === 'page')
	if (!page) throw new Error('no page target in agent-browser session r4-bench')
	return connect(page.webSocketDebuggerUrl)
}

// --- in-page probes ----------------------------------------------------------

// Installed before any app code on every document: switches on the app's own
// measuring, counts in-flight fetches and stamps `lastBusy` on DOM mutations and
// long frames. It logs long frames itself so uninstrumented builds report them too.
const PROBE = `(() => {
	if (window.__bench) return
	try { localStorage.setItem('r5-perf', '1') } catch {}
	const s = (window.__bench = {inflight: 0, lastBusy: 0, worstFrame: 0, frames: []})
	const busy = () => (s.lastBusy = performance.now())
	try {
		new PerformanceObserver((l) => s.frames.push(...l.getEntries()))
			.observe({type: 'long-animation-frame', buffered: true})
	} catch {}
	performance.setResourceTimingBufferSize(10000)
	const fetch = window.fetch
	window.fetch = (...a) => (s.inflight++, busy(), fetch(...a).finally(() => (s.inflight--, busy())))
	let last = performance.now()
	requestAnimationFrame(function loop() {
		const n = performance.now()
		if (n - last > 50) s.lastBusy = n
		s.worstFrame = Math.max(s.worstFrame, n - last)
		last = n
		requestAnimationFrame(loop)
	})
	new MutationObserver(busy).observe(document, {childList: true, subtree: true, characterData: true})
})()`

// settle(t0) resolves once the page has been quiet for QUIET_MS and returns the
// step's metrics; `ms` is the last busy moment, not the moment we noticed quiet.
const PRELUDE = `
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
	const sum = (xs, f) => Math.round(xs.reduce((n, x) => n + f(x), 0))
	async function settle(t0) {
		const s = window.__bench
		const busy = () => s.inflight > 0 || performance.now() - s.lastBusy < ${QUIET_MS}
		s.worstFrame = 0
		await sleep(100)
		while (busy() && performance.now() - t0 < ${STEP_TIMEOUT_MS}) await sleep(50)
		const {spans = {}, fcp = 0, lcp = 0} = window.r5?.perf?.(t0) ?? {}
		const frames = s.frames.filter((f) => f.startTime >= t0)
		const res = performance.getEntriesByType('resource').filter((e) => e.startTime >= t0)
		const end = performance.getEntriesByType('measure')
			.filter((e) => e.name.startsWith('r5:') && e.startTime >= t0)
			.reduce((max, e) => Math.max(max, e.startTime + e.duration), Math.max(s.lastBusy, t0))
		return {
			ms: Math.round(end - t0),
			settled: !busy(),
			worstFrame: Math.round(s.worstFrame),
			requests: {
				data: res.filter((e) => e.name.includes('/rest/v1/')).length,
				images: res.filter((e) => e.initiatorType === 'img').length
			},
			domNodes: document.getElementsByTagName('*').length,
			heapMB: Math.round((performance.memory?.usedJSHeapSize ?? NaN) / 1048576),
			longFrames: {
				count: frames.length,
				total: sum(frames, (f) => f.duration),
				blocking: sum(frames, (f) => f.blockingDuration ?? 0),
				max: Math.round(Math.max(0, ...frames.map((f) => f.duration)))
			},
			spans, fcp, lcp
		}
	}`

const inPage = <T = StepResult>(cdp: Cdp, body: string) =>
	evaluate<T>(cdp, `(async () => { ${PRELUDE}\n${body} })()`)

// --- steps -------------------------------------------------------------------

// A step resolves to null when its element isn't on screen (e.g. no #tag): skipped
type Step = {name: string; run: (cdp: Cdp) => Promise<StepResult | null>}
type StepResult = {ms: number; settled: boolean; [metric: string]: any}

async function fullLoad(cdp: Cdp, path: string) {
	const loaded = cdp.once('Page.loadEventFired')
	await cdp.send('Page.navigate', {url: BASE + path})
	await loaded
	// window.r5 appears once the root layout's preload has run
	return inPage(
		cdp,
		`while (!window.r5) {
			if (performance.now() > ${STEP_TIMEOUT_MS}) throw new Error('window.r5 never appeared')
			await sleep(50)
		}
		return settle(0)`
	)
}

// Times `js` (statements, may await) until the page settles
const act = (js: string) => (cdp: Cdp) =>
	inPage(cdp, `const t0 = performance.now(); ${js}; return settle(t0)`)

// A real link click, so SvelteKit routes it like a user's tap. With `ready`, waits
// for that selector before settling, so a list that renders late isn't missed.
const goto = (path: string, ready?: string) =>
	act(
		`const a = document.body.appendChild(Object.assign(document.createElement('a'), {href: ${JSON.stringify(path)}}))
		a.click()
		a.remove()
		${ready ? `for (let i = 0; i < 300 && !document.querySelector(${JSON.stringify(ready)}); i++) await new Promise((r) => setTimeout(r, 50))` : ''}`
	)

const explore = (moreThan: number, display: string) =>
	goto(`/explore/channels/with-more-than-${moreThan}-tracks?display=${display}`)

const scroll = act(
	`const el = document.querySelector('.scroll-area') || document.scrollingElement
	for (let i = 0; i < 60; i++) {
		el.scrollTop += 400
		await sleep(30)
	}`
)

// A real mouse click on what `find` (a JS expression) returns, so the app's
// slow-tap log sees it like a user's
const tap = (find: string) => async (cdp: Cdp) => {
	const at = await inPage<{x: number; y: number} | null>(
		cdp,
		`const el = ${find}
		if (!el) return null
		el.scrollIntoView({block: 'center'})
		await sleep(100)
		const r = el.getBoundingClientRect()
		window.__t0 = performance.now()
		return {x: r.x + r.width / 2, y: r.y + r.height / 2}`
	)
	if (!at) return null
	for (const type of ['mousePressed', 'mouseReleased'])
		await cdp.send('Input.dispatchMouseEvent', {type, ...at, button: 'left', clickCount: 1})
	// The app closes a slow tap after 1s of quiet
	return inPage(
		cdp,
		`const r = await settle(window.__t0)
		await sleep(1100)
		return {...r, slow: window.r5?.perf?.(window.__t0).slow ?? []}`
	)
}

const $ = (selector: string) => `document.querySelector(${JSON.stringify(selector)})`
// #tags and @mentions in track descriptions are links or buttons, depending on the page
const entity = (prefix: string) =>
	`[...document.querySelectorAll('article.track-card p.description :is(a, button)')].find((e) => e.textContent.trim().startsWith('${prefix}'))`
const deckButton = (name: string) =>
	`document.querySelector(\`[data-deck="\${window.r5.appState.active_deck_id}"] .player button.${name}\`)`

// Signed in as the robot account (credentials in .env.local, see AGENTS.local.md),
// on the channel it owns: add, edit and delete a track the way the forms do.
const OWNER = 'robot-afterhours'
const {R4_ROBOT_EMAIL: email, R4_ROBOT_PASSWORD: password} = process.env
const ROBOT = email && password ? {email, password} : null
const asOwner = (js: string) =>
	act(
		`const c = [...window.r5.channelsCollection.state.values()].find((c) => c.slug === '${OWNER}')
		if (!c) throw new Error('channel not in collection: ${OWNER}')
		${js}`
	)
const OWNER_STEPS: Step[] = [
	{
		name: 'login:owner-tracks',
		run: async (cdp) => {
			await evaluate(
				cdp,
				`window.r5.sdk.auth.signIn(${JSON.stringify(ROBOT)}).then((r) => { if (r.error) throw new Error(r.error.message) })`
			)
			return fullLoad(cdp, `/${OWNER}/tracks`)
		}
	},
	{
		name: 'owner:add',
		run: asOwner(
			`window.__benchTrack = await window.r5.tracks.addTrack(c, {url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'bench track'})`
		)
	},
	{
		name: 'owner:edit',
		run: asOwner(
			`await window.r5.tracks.updateTrack(c, window.__benchTrack, {title: 'bench track, edited'})`
		)
	},
	{name: 'owner:delete', run: asOwner(`await window.r5.tracks.deleteTrack(c, window.__benchTrack)`)}
]

// One journey, in order. Names are the keys baselines are compared by.
const STEPS: Step[] = [
	{name: 'load:home', run: (cdp) => fullLoad(cdp, '/')},
	{name: 'home→channel', run: goto(`/${SLUG}`)},
	// Renders every track at once
	{name: 'channel→tracks', run: goto(`/${SLUG}/tracks`, 'article.track-card')},
	{name: 'scroll:tracks', run: scroll},
	{name: 'tap:hashtag', run: tap(entity('#'))},
	{name: 'tap:mention', run: tap(entity('@'))},
	{name: 'search:tracks', run: goto(`/${SLUG}/tracks?q=love`, 'article.track-card')},
	{name: 'play:track-card', run: tap($('article.track-card button.artwork-trigger'))},
	{name: 'player:next', run: tap(deckButton('next'))},
	{name: 'player:prev', run: tap(deckButton('prev'))},
	{name: 'player:shuffle', run: tap(deckButton('shuffle'))},
	{name: 'tracks→explore', run: explore(10, 'grid')},
	{name: 'play:channel-card', run: tap($('article.card figure > button'))},
	{name: 'explore:list', run: explore(10, 'list')},
	{name: 'explore:map', run: explore(10, 'map')},
	{name: 'explore:tuner', run: explore(10, 'tuner')},
	{name: 'explore:filter', run: explore(1000, 'grid')},
	{name: 'search:channels', run: goto('/search/channels?q=jazz')},
	{name: 'explore→tracks', run: goto(`/${SLUG}/tracks`, 'article.track-card')},
	{name: 'load:channel', run: (cdp) => fullLoad(cdp, `/${SLUG}`)},
	...(ROBOT ? OWNER_STEPS : [])
]

// --- tracing -----------------------------------------------------------------

const TRACE_CATEGORIES = [
	'-*',
	'devtools.timeline',
	'disabled-by-default-devtools.timeline',
	'disabled-by-default-devtools.timeline.frame',
	'disabled-by-default-devtools.timeline.stack',
	'disabled-by-default-v8.cpu_profiler',
	'v8.execute',
	'blink.user_timing',
	'loading',
	'latencyInfo',
	'toplevel'
]

const SOURCE_ROOT = /^.*?(src\/|node_modules\/)/
const LONG_TASK_MS = 100
const PHASES = [
	'FunctionCall',
	'EvaluateScript',
	'UpdateLayoutTree',
	'Layout',
	'PrePaint',
	'Paint',
	'Layerize',
	'Commit',
	'IntersectionObserverController::computeIntersections',
	'MinorGC',
	'MajorGC'
]

// Reads a trace's main-thread CPU profile, mapped to source when the build has
// sourcemaps (--build does). Self time finds hot functions; inclusive time per
// app frame (src/ only) finds which component or module owns the work, overall
// and per long task.
async function topFunctions(file: string, limit = 12) {
	const raw = JSON.parse(readFileSync(file, 'utf8'))
	const events: any[] = raw.traceEvents ?? raw
	type Sample = {id: number; t: number; ms: number}
	type Profile = {pid: number; tid: number; t: number; nodes: Map<number, any>; samples: Sample[]}
	const profiles = new Map<string, Profile>()
	for (const e of events) {
		const key = `${e.pid}:${e.id}`
		if (e.name === 'Profile')
			profiles.set(key, {
				pid: e.pid,
				tid: e.tid,
				t: e.args.data.startTime,
				nodes: new Map(),
				samples: []
			})
		if (e.name !== 'ProfileChunk' || !profiles.has(key)) continue
		const p = profiles.get(key)!
		const {cpuProfile = {}, timeDeltas = []} = e.args.data
		for (const n of cpuProfile.nodes ?? []) p.nodes.set(n.id, n)
		cpuProfile.samples?.forEach((id: number, i: number) => {
			p.t += timeDeltas[i] ?? 0
			p.samples.push({id, t: p.t, ms: (timeDeltas[i + 1] ?? 0) / 1000})
		})
	}
	// Busy time only: an idle service worker can be sampled longer than the page
	const IDLE = ['(idle)', '(program)', '(root)']
	const total = (p: Profile) =>
		p.samples.reduce(
			(n, x) => (IDLE.includes(p.nodes.get(x.id)?.callFrame.functionName) ? n : n + x.ms),
			0
		)
	const main = [...profiles.values()].sort((a, b) => total(b) - total(a))[0]
	if (!main) return {self: [], app: [], owned: [], phases: [], tasks: []}

	const maps = new Map<string, Promise<TraceMap | null>>()
	const mapFor = (url: string) => {
		if (!maps.has(url))
			maps.set(
				url,
				fetch(`${url}.map`)
					.then((r) => (r.ok ? r.text() : null))
					.then(
						(t) => (t ? new TraceMap(t, url) : null),
						() => null
					)
			)
		return maps.get(url)!
	}
	// "name  src/file.ts:12" per node, or null for idle/program/root
	const labels = new Map<number, {label: string; app: boolean} | null>()
	await Promise.all(
		Array.from(main.nodes.values(), async ({id, callFrame: f}) => {
			if (IDLE.includes(f.functionName)) return labels.set(id, null)
			const map = f.url ? await mapFor(f.url) : null
			const pos = map
				? originalPositionFor(map, {line: f.lineNumber + 1, column: f.columnNumber})
				: null
			const src = pos?.source
				? `${pos.source.replace(SOURCE_ROOT, '$1')}:${pos.line}`
				: f.url
					? `${f.url.split('/').pop()}:${f.lineNumber + 1}:${f.columnNumber}`
					: '(native)'
			labels.set(id, {
				label: `${pos?.name || f.functionName || '(anonymous)'}  ${src}`,
				app: src.startsWith('src/')
			})
		})
	)
	const add = (m: Map<string, number>, k: string, ms: number) => m.set(k, (m.get(k) ?? 0) + ms)
	// Every app frame on the sample's stack gets its time, once
	const appFrames = (id: number) => {
		const seen = new Set<string>()
		for (let n = main.nodes.get(id); n; n = main.nodes.get(n.parent)) {
			const l = labels.get(n.id)
			if (l?.app) seen.add(l.label)
		}
		return seen
	}
	const top = (m: Map<string, number>, n = limit) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n)
	const fmt = ([label, ms]: [string, number]) =>
		`  ${String(Math.round(ms)).padStart(5)}ms  ${label}`

	const self = new Map<string, number>()
	const app = new Map<string, number>()
	// Library and native time (DOM inserts, svelte internals) charged to the nearest
	// src/ frame below it, so it gets an owner
	const owned = new Map<string, number>()
	for (const {id, ms} of main.samples) {
		const own = labels.get(id)
		if (own) add(self, own.label, ms)
		for (const l of appFrames(id)) add(app, l, ms)
		if (!own) continue
		for (let n = main.nodes.get(id); n; n = main.nodes.get(n.parent)) {
			const l = labels.get(n.id)
			if (l?.app) {
				add(owned, l.label, ms)
				break
			}
		}
	}
	// Rendering work the JS profile can't see: style, layout, paint, observers
	const phases = new Map<string, number>()
	for (const e of events)
		if (e.ph === 'X' && e.pid === main.pid && e.tid === main.tid && PHASES.includes(e.name))
			add(phases, e.name, e.dur / 1000)
	// Long tasks on the same thread, each with the app code that ran inside it
	const tasks = events
		.filter(
			(e) =>
				e.name === 'RunTask' &&
				e.pid === main.pid &&
				e.tid === main.tid &&
				e.dur >= LONG_TASK_MS * 1000
		)
		.map((task) => {
			const inside = new Map<string, number>()
			for (const {id, t, ms} of main.samples)
				if (t >= task.ts && t <= task.ts + task.dur)
					for (const l of appFrames(id)) add(inside, l, ms)
			const who = top(inside, 4).map(
				([l, ms]) => `${l.split('  ')[1].split('/').pop()} ${Math.round(ms)}`
			)
			return `  task @${Math.round((task.ts - main.samples[0].t) / 1000)}ms ${Math.round(task.dur / 1000)}ms → ${who.join(', ') || '(no app code)'}`
		})
	return {
		self: top(self).map(fmt),
		app: top(app).map(fmt),
		owned: top(owned).map(fmt),
		phases: top(phases).map(fmt),
		tasks
	}
}

async function withTrace<T>(cdp: Cdp, file: string, fn: () => Promise<T>): Promise<T> {
	await cdp.send('Tracing.start', {
		transferMode: 'ReturnAsStream',
		traceConfig: {includedCategories: TRACE_CATEGORIES}
	})
	const result = await fn()
	const done = cdp.once('Tracing.tracingComplete')
	await cdp.send('Tracing.end')
	const {stream: handle} = await done
	let out = ''
	for (let chunk: any; !chunk?.eof;) {
		chunk = await cdp.send('IO.read', {handle})
		out += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString() : chunk.data
	}
	await cdp.send('IO.close', {handle})
	writeFileSync(file, out)
	return result
}

// --- run ---------------------------------------------------------------------

async function freshVisitor(cdp: Cdp) {
	await cdp.send('Storage.clearDataForOrigin', {origin: new URL(BASE).origin, storageTypes: 'all'})
	await cdp.send('Network.clearBrowserCache')
	await cdp.send('Page.navigate', {url: 'about:blank'})
}

const median = (xs: number[]) => {
	const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
	const m = s.length >> 1
	return !s.length ? NaN : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function summarize(results: Record<string, StepResult[]>) {
	return Object.fromEntries(
		Object.entries(results).map(([name, runs]) => {
			const med = (f: (r: StepResult) => number) => median(runs.map(f))
			const spanNames = new Set(runs.flatMap((r) => Object.keys(r.spans)))
			return [
				name,
				{
					ms: med((r) => r.ms),
					blocking: med((r) => r.longFrames.blocking),
					runs: runs.length,
					range: {
						ms: [Math.min(...runs.map((r) => r.ms)), Math.max(...runs.map((r) => r.ms))],
						blocking: [
							Math.min(...runs.map((r) => r.longFrames.blocking)),
							Math.max(...runs.map((r) => r.longFrames.blocking))
						]
					},
					longFrameMax: med((r) => r.longFrames.max),
					worstFrame: med((r) => r.worstFrame),
					dataRequests: med((r) => r.requests.data),
					images: med((r) => r.requests.images),
					domNodes: med((r) => r.domNodes),
					heapMB: med((r) => r.heapMB ?? NaN),
					...(name.startsWith('load:') && {fcp: med((r) => r.fcp), lcp: med((r) => r.lcp)}),
					unsettled: runs.filter((r) => !r.settled).length,
					spans: Object.fromEntries(
						Array.from(spanNames, (s) => [s, med((r) => r.spans[s]?.total ?? 0)])
					)
				}
			]
		})
	)
}

function revision() {
	// In a git worktree (.git is a file) jj reports the main checkout's change
	const worktree = existsSync('.git') && !existsSync('.git/HEAD')
	const jj = worktree
		? {exitCode: 1, stdout: ''}
		: Bun.spawnSync(['jj', 'log', '-r', '@', '--no-graph', '-T', 'change_id.shortest(8)'])
	if (jj.exitCode === 0) return jj.stdout.toString().trim()
	return (
		Bun.spawnSync(['git', 'rev-parse', '--short', 'HEAD']).stdout.toString().trim() || 'unknown'
	)
}

function delta(now: number, before?: number) {
	if (!Number.isFinite(before) || !Number.isFinite(now)) return ''
	const d = now - before!
	return Math.abs(d) < 5 ? ' (=)' : ` (${d > 0 ? '+' : ''}${Math.round(d)})`
}

function tableRows(summary: Record<string, any>, baseline: Record<string, any> = {}) {
	return Object.entries(summary).map(([name, s]) => {
		const b = baseline[name] ?? {}
		const topSpans = Object.entries(s.spans as Record<string, number>)
			.filter(([, ms]) => ms >= 5)
			.sort((x, y) => y[1] - x[1])
			.slice(0, 3)
		return {
			step: name + (s.unsettled ? ` ⚠${s.unsettled}` : ''),
			ms: Math.round(s.ms) + delta(s.ms, b.ms) + (s.runs > 1 ? ` [${s.range.ms.join('–')}]` : ''),
			blocking: Math.round(s.blocking) + delta(s.blocking, b.blocking),
			'worst frame': Math.round(s.worstFrame),
			req: s.dataRequests,
			img: s.images,
			dom: s.domNodes,
			heapMB: s.heapMB,
			'spans (wall ms)': topSpans.map(([n, ms]) => `${n} ${Math.round(ms)}`).join(', ')
		}
	})
}

function printTable(rows: Record<string, unknown>[]) {
	const table = [Object.keys(rows[0]), ...rows.map((r) => Object.values(r).map(String))]
	const widths = table[0].map((_, i) => Math.max(...table.map((r) => r[i].length)))
	const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ')
	table.splice(
		1,
		0,
		widths.map((w) => '-'.repeat(w))
	)
	for (const r of table) console.log(line(r))
}

const markdown = (rows: Record<string, unknown>[]) =>
	[Object.keys(rows[0]), Object.keys(rows[0]).map(() => '---'), ...rows.map(Object.values)]
		.map((r) => `| ${r.join(' | ')} |`)
		.join('\n')

// Builds the app and serves it on its own port, so no preview pane is needed
// Builds the app in `dir` (with sourcemaps, so --trace can name functions) and
// serves it on `port`, so no preview pane is needed. Returns its URL.
async function buildAndServe(dir: string, port: number) {
	log(`building ${dir === '.' ? 'working copy' : dir}…`)
	BUILD = 'bench'
	const env = {...process.env, R4_SOURCEMAP: '1'}
	const build = Bun.spawnSync(['bun', 'run', 'build'], {cwd: dir, env})
	if (build.exitCode !== 0) throw new Error(`build failed:\n${build.stderr}`)
	const vite = join(import.meta.dir, '..', 'node_modules/.bin/vite')
	const server = Bun.spawn(
		[process.execPath, vite, 'preview', '--port', String(port), '--strictPort'],
		{
			cwd: dir,
			stdout: 'ignore',
			stderr: 'ignore'
		}
	)
	process.on('exit', () => server.kill())
	const url = `http://localhost:${port}`
	for (let i = 0; i < 100; i++) {
		if (await isUp(url)) return url
		await Bun.sleep(100)
	}
	throw new Error(`preview never came up on ${url}`)
}

const isUp = (url: string) =>
	fetch(url).then(
		(r) => r.ok,
		() => false
	)

// Checks out `rev` into a temporary git worktree (removed on exit) and serves it
async function serveRev(rev: string, port: number) {
	const jj = Bun.spawnSync(['jj', 'log', '-r', rev, '--no-graph', '-T', 'commit_id'])
	const commit = (jj.exitCode === 0 ? jj.stdout : Bun.spawnSync(['git', 'rev-parse', rev]).stdout)
		.toString()
		.trim()
	if (!commit) throw new Error(`--ab: unknown revision ${rev}`)
	const dir = join(tmpdir(), `r4-ab-${commit.slice(0, 12)}`)
	const root = join(import.meta.dir, '..')
	if (!existsSync(dir)) {
		const add = Bun.spawnSync(['git', 'worktree', 'add', '--detach', dir, commit], {cwd: root})
		if (add.exitCode !== 0) throw new Error(`git worktree add failed:\n${add.stderr}`)
		symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'))
		if (existsSync(join(root, '.env.local')))
			copyFileSync(join(root, '.env.local'), join(dir, '.env.local'))
	}
	process.on('exit', () =>
		Bun.spawnSync(['git', 'worktree', 'remove', '--force', dir], {cwd: root})
	)
	return buildAndServe(dir, port)
}

// Two benches share one Chrome and skew each other, so only one runs at a time
function lock() {
	// In tmp, not the checkout: benches from other worktrees share the same Chrome
	const file = join(tmpdir(), 'r4-bench.lock')
	const pid = existsSync(file) ? Number(readFileSync(file, 'utf8')) : 0
	const alive = pid > 0 && Bun.spawnSync(['kill', '-0', String(pid)]).exitCode === 0
	if (alive)
		throw new Error(`another bench is running (pid ${pid}); wait for it, they'd skew each other`)
	writeFileSync(file, String(process.pid))
	process.on('exit', () => rmSync(file, {force: true}))
}

// Medians per step for both sides, with the change; also saved as JSON and markdown
function printAb(before: Record<string, StepResult[]>, after: Record<string, StepResult[]>) {
	const [b, a] = [summarize(before), summarize(after)]
	// A step skipped on one side (nothing to tap) can't be compared
	const both = Object.keys(a).filter((step) => b[step])
	const dropped = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
		(s) => !both.includes(s)
	)
	const cell = (s: any, k: 'ms' | 'blocking') =>
		`${Math.round(s[k])} (${s.range[k][0]}–${s.range[k][1]})`
	// Overlapping min–max ranges mean the runs can't tell the sides apart
	const change = (k: 'ms' | 'blocking', x: any, y: any) => {
		const [[x0, x1], [y0, y1]] = [x.range[k], y.range[k]]
		if (x0 <= y1 && y0 <= x1) return 'noise'
		return y[k] ? `${x[k] > y[k] ? '+' : ''}${Math.round(((x[k] - y[k]) / y[k]) * 100)}%` : ''
	}
	const spanDiff = (x: Record<string, number>, y: Record<string, number>) =>
		Array.from(
			new Set([...Object.keys(x), ...Object.keys(y)]),
			(n) => [n, y[n] ?? 0, x[n] ?? 0] as const
		)
			.filter(([, from, to]) => Math.abs(to - from) >= 10)
			.sort((p, q) => Math.abs(q[2] - q[1]) - Math.abs(p[2] - p[1]))
			.slice(0, 2)
			.map(([n, from, to]) => `${n} ${Math.round(from)}→${Math.round(to)}`)
			.join(', ')
	const rows = both.map((step) => ({
		step: step + (a[step].runs !== b[step].runs ? ` (${b[step].runs}/${a[step].runs} runs)` : ''),
		'ms before': cell(b[step], 'ms'),
		'ms after': cell(a[step], 'ms'),
		'ms change': change('ms', a[step], b[step]),
		'blocking before': cell(b[step], 'blocking'),
		'blocking after': cell(a[step], 'blocking'),
		'blocking change': change('blocking', a[step], b[step]),
		'worst frame before': Math.round(b[step].worstFrame),
		'worst frame after': Math.round(a[step].worstFrame),
		'spans (wall ms)': spanDiff(a[step].spans, b[step].spans)
	}))
	const date = new Date().toISOString()
	const stem = join(RESULTS_DIR, `${date.slice(0, 19).replace(/[:T]/g, '-')}-ab-${args.ab}`)
	writeFileSync(
		`${stem}.json`,
		JSON.stringify({date, ab: args.ab, runs: RUNS, cpu: CPU, before, after}, null, 2)
	)
	writeFileSync(
		`${stem}.md`,
		`${args.ab} vs working copy · /${SLUG} · ${RUNS} runs each, alternating · cpu ${CPU}x · ${date.slice(0, 10)}\n\n${markdown(rows)}\n`
	)
	log()
	printTable(rows)
	log(`\nmedian (min–max) of ${RUNS} alternating runs each · noise = the ranges overlap`)
	if (dropped.length) log(`not compared, ran on one side only: ${dropped.join(', ')}`)
	log(`saved ${stem}.json and .md`)
}

async function main() {
	mkdirSync(RESULTS_DIR, {recursive: true})
	lock()
	if (args.ab && args.trace) throw new Error('--ab and --trace: run them separately')
	if (loadavg()[0] > cpus().length / 2)
		log(
			`⚠ machine is busy (load ${loadavg()[0].toFixed(1)}): close dev servers and browsers, numbers will be inflated`
		)
	// Before and after, built side by side and benched alternately, so machine noise
	// hits both equally. Otherwise one target.
	const sides = args.ab
		? [
				{name: 'before', url: await serveRev(args.ab, 4180)},
				{name: 'after', url: await buildAndServe('.', 4179)}
			]
		: [{name: '', url: BASE}]
	if (!args.ab) {
		const up = await isUp(BASE)
		if (args.build || (!up && !process.argv.some((a) => a.startsWith('--url')))) {
			if (!args.build) log(`nothing at ${BASE}, so building and serving it`)
			sides[0].url = BASE = await buildAndServe('.', 4179)
		} else if (!up) throw new Error(`nothing at ${BASE}`)
	}
	const limit = RUNS * sides.length * RUN_TIMEOUT_MS
	setTimeout(() => {
		console.error(`bench gave up after ${limit / 1000}s. Is the server up and the page stable?`)
		process.exit(1)
	}, limit).unref()
	const matchedNothing = (flag: string) =>
		new Error(`--${flag} matched nothing. Steps: ${STEPS.map((s) => s.name).join(', ')}`)
	const traced = STEPS.findIndex((s) => s.name === args.trace)
	const steps = args.only
		? STEPS.filter((s) => args.only!.split(',').includes(s.name))
		: args.trace
			? STEPS.slice(0, traced + 1)
			: STEPS
	if (!steps.length) throw matchedNothing('only')
	if (args.trace && traced < 0) throw matchedNothing('trace')

	const cdp = await openPage()
	await cdp.send('Page.enable')
	await cdp.send('Runtime.enable')
	await cdp.send('Network.enable')
	await cdp.send('Page.addScriptToEvaluateOnNewDocument', {source: PROBE})
	await cdp.send('Emulation.setCPUThrottlingRate', {rate: CPU})
	await cdp.send('Emulation.setDeviceMetricsOverride', {
		width: 1280,
		height: 800,
		deviceScaleFactor: 1,
		mobile: false
	})

	const rev = revision()
	log(
		args.ab
			? `bench ${args.ab} vs working copy · /${SLUG} · ${RUNS} runs each, alternating · cpu ${CPU}x`
			: `bench ${BASE}/${SLUG} · rev ${rev} · ${RUNS} runs · cpu ${CPU}x`
	)
	const bySide: Record<string, Record<string, StepResult[]>> = {}
	let traceOut = ''
	for (let run = 1; run <= RUNS; run++)
		for (const side of run % 2 ? sides : sides.toReversed()) {
			BASE = side.url
			const results = (bySide[side.name] ??= {})
			// A run that throws (page died, never loaded) is retried once; its partial
			// steps are dropped so medians only use complete journeys.
			for (let attempt = 1; attempt <= 2; attempt++) {
				const journey: Record<string, StepResult> = {}
				try {
					await freshVisitor(cdp)
					await runJourney(journey)
					for (const [name, r] of Object.entries(journey)) (results[name] ??= []).push(r)
					break
				} catch (err: any) {
					log(
						`  run ${run} ${side.name} failed: ${err.message}${attempt === 1 ? ', retrying' : ', skipped'}`
					)
				}
			}
			async function runJourney(journey: Record<string, StepResult>) {
				// Steps after the first assume the journey so far; --only still runs them in order.
				for (const step of steps) {
					const label = `  run ${run}${side.name && ` ${side.name.padEnd(6)}`} ${step.name.padEnd(17)}`
					const traceFile =
						run === 1 && args.trace === step.name
							? join(RESULTS_DIR, `${STARTED}-${rev}-${step.name}.trace.json`)
							: null
					const r = traceFile
						? await withTrace(cdp, traceFile, () => step.run(cdp))
						: await step.run(cdp)
					if (!r) {
						log(`${label}   skipped (nothing to tap)`)
						continue
					}
					journey[step.name] = r
					log(`${label} ${String(r.ms).padStart(6)}ms${r.settled ? '' : ' (did not settle)'}`)
					if (traceFile) traceOut = traceFile
				}
			}
		}
	cdp.close()
	ab('close')
	if (args.ab) return printAb(bySide.before, bySide.after)
	const results = bySide['']

	const summary = summarize(results)
	const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : undefined
	const date = new Date().toISOString()
	const record = JSON.stringify(
		{rev, date, url: BASE, build: BUILD, slug: SLUG, runs: RUNS, cpu: CPU, summary, raw: results},
		null,
		2
	)
	const stem = join(RESULTS_DIR, `${date.slice(0, 19).replace(/[:T]/g, '-')}-${rev}`)
	const file = `${stem}.json`
	const rows = tableRows(summary, baseline?.summary)
	writeFileSync(file, record)
	writeFileSync(
		`${stem}.md`,
		`${BASE}/${SLUG} · rev ${rev} · ${RUNS} runs · cpu ${CPU}x · ${date.slice(0, 10)}\n\n${markdown(rows)}\n`
	)
	if (args['save-baseline']) writeFileSync(BASELINE, record)

	if (args.json) return console.log(JSON.stringify(summary, null, 2))
	log()
	printTable(rows)
	log()
	log(
		`medians of ${RUNS} · read blocking and worst frame first; ms includes network · spans are wall time, waits included`
	)
	if (baseline) {
		log(`(±n) vs baseline rev ${baseline.rev} from ${baseline.date.slice(0, 10)}`)
		const differs = (['build', 'cpu', 'slug'] as const).filter(
			(k) => baseline[k] !== {build: BUILD, cpu: CPU, slug: SLUG}[k]
		)
		if (differs.length)
			log(`⚠ baseline differs in ${differs.join(', ')}: deltas mean little, use --ab instead`)
	}
	const slow = Object.entries(results).flatMap(([name, runs]) =>
		runs.flatMap((r) => (r.slow ?? []).map((s: any) => ({name, ...s})))
	)
	if (slow.length) log('\nslow taps, as the app logged them (window.r5.perf().slow):')
	for (const s of slow) {
		const why = [...s.spans, ...s.scripts].slice(0, 3).join(', ')
		log(
			`  ${s.name.padEnd(17)} ${String(s.ms).padStart(5)}ms  ${s.target}${why ? `  ← ${why}` : ''}`
		)
	}
	if (!ROBOT) log('owner steps skipped: set R4_ROBOT_EMAIL and R4_ROBOT_PASSWORD in .env.local')
	if (traceOut) {
		const top = await topFunctions(traceOut, Number(args.top))
		log(`\ntop functions in ${args.trace} (self time, main thread):`)
		for (const line of top.self) log(line)
		log(`\napp code by inclusive time (src/ only, includes what it calls):`)
		for (const line of top.app) log(line)
		log(`\nlibrary and native time by the app frame that caused it (DOM inserts, svelte):`)
		for (const line of top.owned) log(line)
		log(`\nmain-thread phases (wall time, nested ones overlap):`)
		for (const line of top.phases) log(line)
		log(`\nlong tasks (≥${LONG_TASK_MS}ms) and the app code inside each:`)
		for (const line of top.tasks) log(line)
		log(`trace → ${traceOut} (DevTools → Performance → Load profile)`)
	}
	log(`saved ${file} and .md${args['save-baseline'] ? ' (and as baseline)' : ''}`)
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err.message ?? err)
		process.exit(1)
	})
