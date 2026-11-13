#!/usr/bin/env bun
// Order independence check: a page shows the same rows whether you land on it cold or
// arrive after visiting other routes. Read-only against production data, never signs in.
//
//   bun run test:order                    # builds `freshup` into a temp worktree, serves it
//                                         # on :4183, 2 runs of every walk (~4 min)
//   bun run test:order --runs 3           # more runs, to tell flaky from reproduced
//   bun run test:order --only search-before-channel,back-forward
//   bun run test:order --url http://localhost:4173   # an existing build (never dev, never an IP)
//   bun run test:order --out ../r4-svelte-freshup/order-findings.md
//
// For every page a walk passes through, it records what the page shows once quiet: the
// ordered ids of track rows, the channel cards and tags, the counts the page claims, and
// whether it is still loading. Cold is a fresh browser context loading that URL directly,
// twice per run (start and end), so a difference between the two colds is the page's own
// noise, not a finding. A walk is a fresh context: one full load, then in-app link clicks,
// back/forward, a play tap or a reload with storage kept. Every step after the first is
// compared with cold for its URL. Any difference is a finding.
//
// CDP plumbing mirrors perf/bench.ts (same quiet rule, same link-click navigation, same
// agent-browser launch), but each walk gets its own browser context instead of wiping
// storage, so walks are isolated from each other and can run side by side.

/* eslint-disable @typescript-eslint/no-explicit-any -- CDP messages are untyped JSON */
import {parseArgs} from 'node:util'
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	symlinkSync,
	writeFileSync
} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {spawn, spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const {values: args} = parseArgs({
	options: {
		url: {type: 'string'},
		rev: {type: 'string', default: 'freshup'},
		runs: {type: 'string', default: '2'},
		only: {type: 'string'},
		parallel: {type: 'string', default: '3'},
		cpu: {type: 'string', default: '1'},
		out: {type: 'string'},
		help: {type: 'boolean', short: 'h', default: false}
	}
})
if (args.help) {
	console.log(
		readFileSync(fileURLToPath(import.meta.url), 'utf8')
			.split('\n')
			.slice(1, 11)
			.join('\n')
	)
	process.exit(0)
}

// Node APIs, not Bun's: tsconfig includes tests/ and has no bun types
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const RESULTS_DIR = join(HERE, 'results')
const RUNS = Number(args.runs)
const PARALLEL = Number(args.parallel)
const CPU = Number(args.cpu)
const QUIET_MS = 500
const STEP_TIMEOUT_MS = 30_000
const PORT = 4183
const TRAILING_SLASH = /\/$/
// YouTube refuses embeds on an IP origin (error 150); bench.ts refuses them too
const IP_HOST = /^\d+(\.\d+){3}$|^\[/
let BASE = ''

// --- the pages and walks -------------------------------------------------------

// Big channel (/oskar, ~2.6k tracks) and a small one (/counting, ~140 tracks)
const BIG = 'oskar'
const SMALL = 'counting'

type Action =
	| ['load', string] // full page load; storage kept unless it is the walk's first step
	| ['go', string] // in-app link click, like a user's tap
	| ['back']
	| ['forward']
	| ['play'] // tap the first track card's play button
	| ['reload']
	| ['skim', string] // in-app link click, then on to the next step after 300ms: an impatient user
type Walk = {name: string; why: string; steps: Action[]}

const WALKS: Walk[] = [
	// A partial fetch before a full one
	{
		name: 'search-channel-then-channel',
		why: '@channel search loads one page of the channel, then the full list',
		steps: [
			['load', `/search/tracks?q=@${BIG}`],
			['go', `/${BIG}/tracks`],
			['go', `/${BIG}`]
		]
	},
	{
		name: 'search-channel-then-home',
		why: '@channel search, then the channel home',
		steps: [
			['load', `/search/tracks?q=@${BIG}`],
			['go', `/${BIG}`]
		]
	},
	{
		name: 'recent-then-channel',
		why: 'the recent feed upserts 50 loose tracks, then a channel',
		steps: [
			['load', '/explore/tracks/recent'],
			['go', `/${BIG}/tracks`],
			['go', '/explore/tracks/featured']
		]
	},
	{
		name: 'typing-search',
		why: 'search as you type: a prefix query before the full one',
		steps: [
			['load', '/search?q=lo'],
			['go', '/search?q=love'],
			['go', `/search?q=@${BIG} love`]
		]
	},
	// A search before a channel
	{
		name: 'search-before-channel',
		why: 'remote text search writes rows from many channels, then a channel filters locally',
		steps: [
			['load', '/search?q=love'],
			['go', `/${BIG}/tracks?q=love`],
			['go', `/${BIG}/tracks`]
		]
	},
	{
		name: 'search-tag-before-channel-tag',
		why: 'remote #tag search, then the same tag on one channel',
		steps: [
			['load', '/search/tracks?q=%23house'],
			['go', `/${BIG}/tracks?tags=house`],
			['go', `/search/tracks?q=@${BIG} %23house`]
		]
	},
	{
		name: 'multi-channel-before-channel',
		why: 'several channels go remote and page there, then one of them locally',
		steps: [
			['load', `/search/tracks?q=@${BIG} @${SMALL} love`],
			['go', `/${SMALL}/tracks`],
			['go', `/${SMALL}`],
			['go', `/${BIG}/tracks?q=love`]
		]
	},
	// A channel before a search
	{
		name: 'channel-before-search',
		why: 'the full channel is in the collection when a remote search runs',
		steps: [
			['load', `/${BIG}/tracks`],
			['go', '/search?q=love'],
			['go', '/search/tracks?q=%23house'],
			['go', `/search/tracks?q=@${BIG} @${SMALL} love`]
		]
	},
	{
		name: 'channel-before-channel-search',
		why: 'the channel is loaded, then searched by @slug from the search page',
		steps: [
			['load', `/${SMALL}/tracks`],
			['go', `/search/tracks?q=@${SMALL}`],
			['go', `/search?q=@${SMALL} %23hip-hop`]
		]
	},
	{
		name: 'search-channel-then-tag',
		why: '@channel search, then the same channel with a tag on the mixed search page',
		steps: [
			['load', `/search/tracks?q=@${SMALL}`],
			['go', `/search?q=@${SMALL} %23hip-hop`]
		]
	},
	{
		name: 'search-big-channel-then-filters',
		why: '@channel search on the big channel, then text and a tag on the mixed search page',
		steps: [
			['load', `/search/tracks?q=@${BIG}`],
			['go', `/search?q=@${BIG} love`],
			['go', `/search?q=@${BIG} %23house`],
			['go', `/search/tracks?q=@${BIG} %23house`]
		]
	},
	{
		name: 'search-channel-then-channel-tag',
		why: "@channel search, then that channel's own tag filter, then the search again",
		steps: [
			['load', `/search/tracks?q=@${SMALL}`],
			['go', `/${SMALL}/tracks?tags=hip-hop`],
			['go', `/search?q=@${SMALL} %23hip-hop`]
		]
	},
	{
		name: 'channel-then-search-tag',
		why: 'the channel is loaded, then searched with a tag',
		steps: [
			['load', `/${SMALL}/tracks`],
			['go', `/search?q=@${SMALL} %23hip-hop`],
			['go', `/search/tracks?q=@${SMALL} %23hip-hop`]
		]
	},
	{
		name: 'typing-channel-then-tag',
		why: 'typing @slug, then adding a #tag',
		steps: [
			['load', `/search?q=@${SMALL}`],
			['go', `/search?q=@${SMALL} %23hip-hop`],
			['go', `/search?q=@${BIG} %23house`]
		]
	},
	// Clicking on before the page has settled: in-flight fetches race the next route
	{
		name: 'impatient-search-to-channel',
		why: 'leave a @channel search mid-fetch for the channel',
		steps: [
			['load', `/${SMALL}`],
			['skim', `/search/tracks?q=@${BIG}`],
			['go', `/${BIG}/tracks`],
			['go', `/${BIG}/tracks?tags=house`]
		]
	},
	{
		name: 'impatient-channel-to-search',
		why: 'leave a channel mid-load for a search on it',
		steps: [
			['load', '/'],
			['skim', `/${BIG}/tracks`],
			['go', `/search?q=@${BIG} love`],
			['go', `/search/tracks?q=@${BIG} %23house`]
		]
	},
	{
		name: 'impatient-filters',
		why: 'switch tag, mention and text faster than the page settles',
		steps: [
			['load', `/${SMALL}`],
			['skim', `/${BIG}/tracks?tags=house`],
			['skim', `/${BIG}/tracks?mention=ko002`],
			['go', `/${BIG}/tracks?q=love`],
			['go', `/${BIG}/tracks?tags=house`]
		]
	},
	{
		name: 'impatient-typing',
		why: 'type a search faster than the results arrive',
		steps: [
			['load', '/search'],
			['skim', '/search?q=l'],
			['skim', '/search?q=lo'],
			['skim', '/search?q=lov'],
			['go', '/search?q=love'],
			['skim', '/search?q=love %23h'],
			['go', '/search?q=love %23house']
		]
	},
	{
		name: 'reload-while-playing',
		why: 'a playing deck restores its channel on reload, then the channel filters',
		steps: [
			['load', `/${SMALL}/tracks`],
			['play'],
			['load', `/${BIG}/tracks?tags=house`],
			['go', `/${SMALL}/tracks?tags=hip-hop`],
			['go', `/search/tracks?q=@${SMALL} @${BIG} %23house`]
		]
	},
	// Filters on a channel
	{
		name: 'filters-in-a-row',
		why: 'tag, mention, text on one channel, one after the other',
		steps: [
			['load', '/'],
			['go', `/${BIG}`],
			['go', `/${BIG}/tracks?tags=house`],
			['go', `/${BIG}/tracks?mention=ko002`],
			['go', `/${BIG}/tracks?q=love`],
			['go', `/${BIG}/tracks`]
		]
	},
	{
		name: 'channel-switch',
		why: 'a filtered channel, then another channel with a filter, then back',
		steps: [
			['load', `/${BIG}/tracks?tags=house`],
			['go', `/${SMALL}/tracks?tags=hip-hop`],
			['go', `/${SMALL}/tracks`],
			['go', `/${BIG}/tracks?tags=house`]
		]
	},
	{
		name: 'small-then-big',
		why: 'the small channel first, then the big one fresh',
		steps: [
			['load', `/${SMALL}`],
			['go', `/${BIG}`],
			['go', `/${BIG}/tracks`]
		]
	},
	// Playing a track, then filtering
	{
		name: 'play-then-filter',
		why: 'the deck pins its queue by id, then the channel and search filter',
		steps: [
			['load', `/${BIG}/tracks`],
			['play'],
			['go', `/${BIG}/tracks?tags=house`],
			['go', '/search/tracks?q=%23house'],
			['go', `/${BIG}/tracks`]
		]
	},
	{
		name: 'play-other-then-channel',
		why: "another channel's deck is playing while this one loads",
		steps: [
			['load', `/${SMALL}/tracks`],
			['play'],
			['go', `/${BIG}/tracks`],
			['go', `/${BIG}/tracks?tags=house`],
			['go', `/${SMALL}/tracks?tags=hip-hop`]
		]
	},
	// Back and forward
	{
		name: 'back-forward',
		why: 'history steps back into a filtered channel and a search',
		steps: [
			['load', `/${BIG}/tracks`],
			['go', `/${BIG}/tracks?tags=house`],
			['go', '/search?q=love'],
			['back'],
			['back'],
			['forward'],
			['forward']
		]
	},
	// A reload with storage kept: persisted query cache from earlier routes
	{
		name: 'reload-after-search',
		why: 'a @channel search persists a partial channel, then a full load of it',
		steps: [
			['load', `/search/tracks?q=@${BIG}`],
			['load', `/${BIG}/tracks`],
			['load', `/${BIG}`]
		]
	},
	{
		name: 'reload-after-channel',
		why: 'a channel persists, then a full load of a search and a filter',
		steps: [
			['load', `/${BIG}/tracks`],
			['load', '/search?q=love'],
			['load', `/${BIG}/tracks?tags=house`],
			['reload']
		]
	},
	// Explore and tags
	{
		name: 'explore-filters',
		why: 'channel directory filters one after the other',
		steps: [
			['load', '/explore/channels/with-more-than-10-tracks'],
			['go', '/explore/channels/with-more-than-1000-tracks'],
			['go', '/explore/channels/with-more-than-100-tracks']
		]
	},
	{
		name: 'search-channels-then-explore',
		why: 'channel search upserts channels, then the directory filters them',
		steps: [
			['load', '/search/channels?q=jazz'],
			['go', '/explore/channels/with-more-than-1000-tracks'],
			['go', '/explore/channels/with-more-than-100-tracks']
		]
	},
	{
		name: 'channel-then-explore',
		why: 'a channel loaded, then the directory and tags',
		steps: [
			['load', `/${BIG}`],
			['go', '/explore/channels/with-more-than-1000-tracks'],
			['go', '/explore/tags/featured'],
			['go', '/search/channels?q=jazz']
		]
	},
	{
		name: 'search-then-tags',
		why: 'a tag search, then the tags page',
		steps: [
			['load', '/search/tracks?q=%23house'],
			['go', '/explore/tags/featured'],
			['go', `/${BIG}/tags`]
		]
	}
]

// --- CDP (one browser connection, one flat session per page) --------------------

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
			const key = `${m.sessionId ?? ''}:${m.method}`
			waiters.get(key)?.(m.params)
			waiters.delete(key)
		}
	}
	const send = <T = any>(method: string, params = {}, sessionId?: string) =>
		new Promise<T>((res, rej) => {
			calls.set(++id, {res, rej})
			ws.send(JSON.stringify({id, method, params, ...(sessionId && {sessionId})}))
		})
	const once = (event: string, sessionId = '') =>
		new Promise<any>((res) => waiters.set(`${sessionId}:${event}`, res))
	return {send, once, close: () => ws.close()}
}
type Browser = Awaited<ReturnType<typeof connect>>

const sh = (cmd: string[], cwd = ROOT) => {
	const p = spawnSync(cmd[0], cmd.slice(1), {cwd, encoding: 'utf8'})
	return {ok: p.status === 0, out: (p.stdout ?? '').trim(), err: p.stderr ?? ''}
}

const ab = (...cmd: string[]) => {
	const p = sh(['agent-browser', '--session', 'r4-order', ...cmd])
	if (!p.ok) throw new Error(`agent-browser ${cmd.join(' ')}: ${p.err}`)
	return p.out
}

async function openBrowser() {
	ab('--args', '--mute-audio', 'open', 'about:blank')
	const host = new URL(ab('get', 'cdp-url')).host
	const {webSocketDebuggerUrl} = await (await fetch(`http://${host}/json/version`)).json()
	return connect(webSocketDebuggerUrl)
}

// Same probe as perf/bench.ts, minus the perf bits: in-flight fetches and the last
// DOM mutation, so a step can wait until the page is quiet
const PROBE = `(() => {
	if (window.__order) return
	const s = (window.__order = {inflight: 0, lastBusy: 0})
	// The channel directory shuffles per visit by default; sort by track count (a
	// user setting) so two visits can be compared. Only on a fresh profile.
	try {
		if (!localStorage.getItem('r5-app-state'))
			localStorage.setItem('r5-app-state', JSON.stringify({channels_order: 'tracks'}))
	} catch {}
	const busy = () => (s.lastBusy = performance.now())
	const fetch = window.fetch
	window.fetch = (...a) => (s.inflight++, busy(), fetch(...a).finally(() => (s.inflight--, busy())))
	const ticking = (node) => (node.nodeType === 1 ? node : node.parentElement)?.closest('time')
	new MutationObserver((records) => {
		if (records.some((r) => !ticking(r.target))) busy()
	}).observe(document, {childList: true, subtree: true, characterData: true})
})()`

// What a page shows, read the same way on every page: track rows by id in DOM order,
// channel cards by slug, tag rows, the numbers it prints outside those rows, and
// whether a loader is still up. Counts in the player/deck are left out (they belong
// to the deck, not the page).
const READ = `(() => {
	const main = document.querySelector('main') || document.body
	const outside = (el) => !el.closest('[data-deck], .player, aside, dialog, header.app')
	const uniq = (xs) => [...new Set(xs)]
	// Tracklist rows carry data-track-id. Search and explore render bare track cards:
	// read the id from a /slug/tracks/<id> link when the card has one, else slug + title
	const trackId = (e) => {
		if (e.dataset.trackId) return e.dataset.trackId
		const hrefs = [...(e.closest('li') || e).querySelectorAll('a')].map((a) => a.getAttribute('href') || '')
		const id = hrefs.map((h) => h.match(/\\/tracks\\/([0-9a-f-]{36})/)?.[1]).find(Boolean)
		if (id) return id
		const slug = hrefs.find((h) => /^\\/[^/?#]+$/.test(h)) || '?'
		return slug + ' ' + e.querySelector('h3')?.textContent.trim()
	}
	const tracks = uniq([...main.querySelectorAll('[data-track-id], article.track-card')]
		.filter((e) => outside(e) && !(e.matches('article') && e.closest('[data-track-id]')))
		.map(trackId))
	const channels = uniq([...main.querySelectorAll('article.card h3 a, .channel-micro-card a, a.channel-micro-card')]
		.filter(outside).map((a) => a.getAttribute('href')))
	const tags = uniq([...main.querySelectorAll('a[href*="q=%23"], a[href*="q=#"]')]
		.filter((a) => outside(a) && !a.closest('[data-track-id], article.track-card'))
		.map((a) => a.textContent.trim().replace(/\\s+/g, ' ')))
	// Every visible number outside the rows: "Tracks 2,655", "Play 98", "123 results"
	const claims = []
	const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
	for (let n; (n = walker.nextNode()); ) {
		const el = n.parentElement
		if (!el || !/\\d/.test(n.textContent)) continue
		if (el.closest('[data-track-id], article.track-card, article.card, time, script, style, [hidden]')) continue
		if (!outside(el) || !el.offsetParent) continue
		const label = (el.closest('a, button, h1, h2, h3, h4, p, li, label, summary, span') || el)
		const text = label.textContent.trim().replace(/\\s+/g, ' ').slice(0, 80)
		// Month headings in the timeline are rows, not counts
		if (/^[A-Z][a-z]+ \\d{4}$/.test(text)) continue
		claims.push(text)
	}
	const loading = !!main.querySelector('progress, [aria-busy="true"]')
	return {url: location.pathname + location.search, tracks, channels, tags, claims: uniq(claims), loading}
})()`

type Shot = {
	url: string
	tracks: string[]
	channels: string[]
	tags: string[]
	claims: string[]
	loading: boolean
	settled: boolean
	stable: boolean
}

// A page in its own browser context: its own storage, cache and service worker
async function newPage(browser: Browser) {
	const {browserContextId} = await browser.send('Target.createBrowserContext', {
		disposeOnDetach: true
	})
	const {targetId} = await browser.send('Target.createTarget', {
		url: 'about:blank',
		browserContextId
	})
	const {sessionId} = await browser.send('Target.attachToTarget', {targetId, flatten: true})
	const send = (method: string, params = {}) => browser.send(method, params, sessionId)
	await send('Page.enable')
	await send('Runtime.enable')
	await send('Page.addScriptToEvaluateOnNewDocument', {source: PROBE})
	if (CPU > 1) await send('Emulation.setCPUThrottlingRate', {rate: CPU})
	await send('Emulation.setDeviceMetricsOverride', {
		width: 1280,
		height: 800,
		deviceScaleFactor: 1,
		mobile: false
	})
	// Background targets would otherwise throttle timers and skip rendering
	await send('Emulation.setFocusEmulationEnabled', {enabled: true})
	const evaluate = async <T = any>(expression: string): Promise<T> => {
		const r = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true})
		if (r.exceptionDetails)
			throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
		return r.result.value
	}
	const loaded = () => browser.once('Page.loadEventFired', sessionId)
	return {
		send,
		evaluate,
		loaded,
		close: () => browser.send('Target.disposeBrowserContext', {browserContextId}).catch(() => {})
	}
}
type Page = Awaited<ReturnType<typeof newPage>>

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Resolves once no fetch is in flight and nothing mutated for QUIET_MS; false on timeout
const settle = (page: Page) =>
	page.evaluate<boolean>(`(async () => {
		const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
		const t0 = performance.now()
		while (!window.r5 || !window.__order) {
			if (performance.now() - t0 > ${STEP_TIMEOUT_MS}) return false
			await sleep(50)
		}
		const s = window.__order
		const busy = () => s.inflight > 0 || performance.now() - s.lastBusy < ${QUIET_MS}
		await sleep(150)
		while (busy()) {
			if (performance.now() - t0 > ${STEP_TIMEOUT_MS}) return false
			await sleep(50)
		}
		return true
	})()`)

// Reads the page until two reads a second apart agree (up to 4 tries)
async function shoot(page: Page): Promise<Shot> {
	const settled = await settle(page)
	let prev = await page.evaluate<Omit<Shot, 'settled' | 'stable'>>(READ)
	for (let i = 0; i < 4; i++) {
		await sleep(1000)
		await settle(page)
		const next = await page.evaluate(READ)
		if (JSON.stringify(next) === JSON.stringify(prev)) return {...next, settled, stable: true}
		prev = next
	}
	return {...prev, settled, stable: false}
}

async function act(page: Page, action: Action) {
	const [kind, path] = action
	if (kind === 'load' || kind === 'reload') {
		const loaded = page.loaded()
		if (kind === 'load') await page.send('Page.navigate', {url: BASE + path})
		else await page.send('Page.reload')
		await Promise.race([loaded, sleep(STEP_TIMEOUT_MS)])
		return
	}
	if (kind === 'go' || kind === 'skim')
		return page.evaluate(`(() => {
			const a = document.body.appendChild(Object.assign(document.createElement('a'), {href: ${JSON.stringify(path)}}))
			a.click()
			a.remove()
		})()`)
	if (kind === 'back' || kind === 'forward') return page.evaluate(`history.${kind}()`)
	if (kind === 'play') {
		// A real mouse click, as in bench's play:track-card
		const at = await page.evaluate(`(async () => {
			for (let i = 0; i < 100 && !document.querySelector('article.track-card button.artwork-trigger'); i++)
				await new Promise((r) => setTimeout(r, 100))
			const el = document.querySelector('article.track-card button.artwork-trigger')
			if (!el) return null
			el.scrollIntoView({block: 'center'})
			await new Promise((r) => setTimeout(r, 100))
			const r = el.getBoundingClientRect()
			return {x: r.x + r.width / 2, y: r.y + r.height / 2}
		})()`)
		if (!at) throw new Error('play: no track card to tap')
		for (const type of ['mousePressed', 'mouseReleased'])
			await page.send('Input.dispatchMouseEvent', {type, ...at, button: 'left', clickCount: 1})
		await sleep(1500)
	}
}

// --- running ---------------------------------------------------------------------

const label = (a: Action) => (a.length > 1 ? `${a[0]} ${a[1]}` : a[0])

/** The URL a walk's step lands on, tracked here so back/forward know it. */
function urlsOf(walk: Walk): (string | null)[] {
	const history: string[] = []
	let at = -1
	return walk.steps.map(([kind, path]) => {
		if (kind === 'load' || kind === 'go' || kind === 'skim') {
			history.splice(at + 1)
			history.push(path!)
			at = history.length - 1
		} else if (kind === 'back') at--
		else if (kind === 'forward') at++
		else if (kind === 'play') return null // same page, a deck now playing: compared too
		return history[at]
	})
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<unknown>) {
	const queue = [...items]
	await Promise.all(
		Array.from({length: Math.min(n, queue.length)}, async () => {
			while (queue.length) await fn(queue.shift()!)
		})
	)
}

async function cold(browser: Browser, path: string): Promise<Shot> {
	const page = await newPage(browser)
	try {
		await act(page, ['load', path])
		return await shoot(page)
	} finally {
		await page.close()
	}
}

type Checkpoint = {walk: string; step: number; via: string; path: string; shot: Shot}

async function walk(browser: Browser, w: Walk): Promise<Checkpoint[]> {
	const page = await newPage(browser)
	const urls = urlsOf(w)
	const out: Checkpoint[] = []
	try {
		let last = urls[0]!
		for (const [i, step] of w.steps.entries()) {
			await act(page, step)
			const path = urls[i] ?? last
			last = path
			if (step[0] === 'skim') {
				await sleep(300)
				continue
			}
			const shot = await shoot(page)
			// The first full load is cold by definition
			if (i > 0)
				out.push({
					walk: w.name,
					step: i,
					via: w.steps
						.slice(0, i + 1)
						.map(label)
						.join(' → '),
					path,
					shot
				})
		}
	} finally {
		await page.close()
	}
	return out
}

// --- comparing -----------------------------------------------------------------

type Diff = {kind: string; detail: string; weight: number}

/** Lines in a that b lacks, both ways, minus what differs between the two colds. */
function setDiff(a: string[], b: string[], noise: Set<string>) {
	const sa = new Set(a)
	const sb = new Set(b)
	return {
		missing: a.filter((x) => !sb.has(x) && !noise.has(x)),
		extra: b.filter((x) => !sa.has(x) && !noise.has(x))
	}
}

const short = (xs: string[], n = 3) =>
	xs
		.slice(0, n)
		.map((x) => (x.length > 40 ? x.slice(0, 8) : x))
		.join(', ') + (xs.length > n ? ` +${xs.length - n}` : '')

function compare(ref: Shot, ref2: Shot, got: Shot): Diff[] {
	const diffs: Diff[] = []
	const noisy = (a: string[], b: string[]) =>
		new Set([...a.filter((x) => !b.includes(x)), ...b.filter((x) => !a.includes(x))])
	const pathOnly = (u: string) => u
	if (pathOnly(got.url) !== pathOnly(ref.url) && pathOnly(ref.url) === pathOnly(ref2.url))
		diffs.push({kind: 'wrong url', detail: `${got.url}, cold ${ref.url}`, weight: 50})
	for (const field of ['tracks', 'channels', 'tags'] as const) {
		const coldStable = JSON.stringify(ref[field]) === JSON.stringify(ref2[field])
		const noise = noisy(ref[field], ref2[field])
		const rows = field === 'tracks' ? 'rows' : field
		// A field that differs between the two colds is random by design: compare its size
		if (!coldStable) {
			const sizes = [ref[field].length, ref2[field].length]
			if (!sizes.includes(got[field].length))
				diffs.push({
					kind: got[field].length < Math.min(...sizes) ? `missing ${rows}` : `extra ${rows}`,
					detail: `shows ${got[field].length}, cold ${sizes.join(' and ')} (cold order is random)`,
					weight: got[field].length ? 60 : 1000
				})
			continue
		}
		const {missing, extra} = setDiff(ref[field], got[field], noise)
		if (missing.length && !got[field].length)
			diffs.push({
				kind: `no ${rows}`,
				detail: `shows 0, cold ${ref[field].length}`,
				weight: 1000 + ref[field].length
			})
		else if (missing.length)
			diffs.push({
				kind: `missing ${rows}`,
				detail: `${missing.length} of ${ref[field].length} (${short(missing)})`,
				weight: 100 + missing.length
			})
		if (extra.length)
			diffs.push({
				kind: `extra ${rows}`,
				detail: `${extra.length} not in cold's ${ref[field].length} (${short(extra)})`,
				weight: 100 + extra.length
			})
		if (!missing.length && !extra.length && coldStable) {
			const common = got[field].filter((x) => ref[field].includes(x))
			const at = common.findIndex((x, i) => ref[field][i] !== x)
			if (at >= 0)
				diffs.push({
					kind: `wrong ${field === 'tracks' ? 'row' : field.slice(0, -1)} order`,
					detail: `first differs at #${at + 1} of ${common.length}`,
					weight: 20
				})
		}
	}
	const claimNoise = noisy(ref.claims, ref2.claims)
	const {missing, extra} = setDiff(ref.claims, got.claims, claimNoise)
	if (missing.length || extra.length)
		diffs.push({
			kind: 'wrong count',
			detail: `shows ${JSON.stringify(extra.slice(0, 3))}, cold ${JSON.stringify(missing.slice(0, 3))}`,
			weight: 30
		})
	if ((got.loading || !got.settled) && !ref.loading && !ref2.loading)
		diffs.push({
			kind: 'stuck loading',
			detail: got.settled ? 'loader still up' : `not quiet after ${STEP_TIMEOUT_MS / 1000}s`,
			weight: 40
		})
	if (!got.stable && ref.stable && ref2.stable)
		diffs.push({kind: 'never settles', detail: 'rows still changing after 4s', weight: 10})
	return diffs
}

// --- build and serve ---------------------------------------------------------------

const isUp = (url: string) =>
	fetch(url, {signal: AbortSignal.timeout(1000)}).then(
		(r) => r.ok,
		() => false
	)

// Same as bench's serveRev: a git worktree of `rev` in tmp, built and previewed
async function serveRev(rev: string) {
	const jj = sh(['jj', 'log', '-r', rev, '--no-graph', '-T', 'commit_id'])
	const commit = jj.out
	if (!jj.ok || !commit) throw new Error(`unknown revision ${rev}`)
	const dir = join(tmpdir(), `r4-order-${commit.slice(0, 12)}`)
	if (!existsSync(dir)) {
		const add = sh(['git', 'worktree', 'add', '--detach', dir, commit])
		if (!add.ok) throw new Error(`git worktree add failed:\n${add.err}`)
		symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'))
		if (existsSync(join(ROOT, '.env.local')))
			copyFileSync(join(ROOT, '.env.local'), join(dir, '.env.local'))
	}
	const url = `http://localhost:${PORT}`
	// A preview of the same commit may still be up from the last run
	const stamp = join(dir, '.order-built')
	if (!(existsSync(stamp) && (await isUp(url)))) {
		if (!existsSync(stamp)) {
			console.log(`building ${rev} (${commit.slice(0, 8)}) in ${dir}…`)
			const build = sh(['bun', 'run', 'build'], dir)
			if (!build.ok) throw new Error(`build failed:\n${build.err}`)
			writeFileSync(stamp, commit)
		}
		const vite = join(ROOT, 'node_modules/.bin/vite')
		const server = spawn(
			process.execPath,
			[vite, 'preview', '--port', String(PORT), '--strictPort'],
			{
				cwd: dir,
				stdio: 'ignore'
			}
		)
		process.on('exit', () => server.kill())
		for (let i = 0; i < 100 && !(await isUp(url)); i++) await sleep(100)
		if (!(await isUp(url))) throw new Error(`preview never came up on ${url}`)
	}
	return {url, commit}
}

// --- main ----------------------------------------------------------------------

type Finding = {
	walk: string
	via: string
	path: string
	kind: string
	runs: string[]
	weight: number
}

async function main() {
	const t0 = performance.now()
	mkdirSync(RESULTS_DIR, {recursive: true})
	let commit = 'external'
	if (args.url) {
		BASE = args.url.replace(TRAILING_SLASH, '')
		if (IP_HOST.test(new URL(BASE).hostname))
			throw new Error('use localhost, not an IP: YouTube refuses to embed there')
		if (!(await isUp(BASE))) throw new Error(`nothing at ${BASE}`)
	} else ({url: BASE, commit} = await serveRev(args.rev!))

	const walks = args.only ? WALKS.filter((w) => args.only!.split(',').includes(w.name)) : WALKS
	if (!walks.length) throw new Error(`--only matched nothing. Walks: ${WALKS.map((w) => w.name)}`)
	const paths = [
		...new Set(
			walks.flatMap((w) => urlsOf(w).filter((u, i): u is string => !!u && w.steps[i][0] !== 'skim'))
		)
	]
	console.log(
		`order · ${BASE} · ${walks.length} walks · ${paths.length} pages · ${RUNS} runs · ${PARALLEL} at a time`
	)

	const browser = await openBrowser()
	// finding key → which runs it showed up in
	const found = new Map<string, Finding & {details: string[]}>()
	const coldNoise: string[] = []
	const raw: any[] = []
	for (let run = 1; run <= RUNS; run++) {
		const colds = new Map<string, Shot>()
		const colds2 = new Map<string, Shot>()
		await pool(paths, PARALLEL, async (p) => colds.set(p, await cold(browser, p)))
		const checkpoints: Checkpoint[] = []
		await pool(walks, PARALLEL, async (w) => {
			try {
				checkpoints.push(...(await walk(browser, w)))
			} catch (err: any) {
				console.log(`  run ${run} ${w.name} failed: ${err.message}`)
			}
		})
		await pool(paths, PARALLEL, async (p) => colds2.set(p, await cold(browser, p)))
		for (const p of paths) {
			const [a, b] = [colds.get(p)!, colds2.get(p)!]
			for (const f of ['tracks', 'channels', 'tags', 'claims'] as const)
				if (JSON.stringify(a[f]) !== JSON.stringify(b[f]))
					coldNoise.push(`run ${run} ${p}: ${f} differ between two cold loads`)
		}
		let count = 0
		for (const c of checkpoints) {
			const all = compare(colds.get(c.path)!, colds2.get(c.path)!, c.shot)
			// One finding per page visit; its kinds and details joined
			const diffs = all.length
				? [
						{
							kind: all.map((d) => d.kind).join(', '),
							detail: all.map((d) => `${d.kind}: ${d.detail}`).join('; '),
							weight: Math.max(...all.map((d) => d.weight))
						}
					]
				: []
			for (const d of diffs) {
				count++
				const key = `${c.walk}|${c.step}`
				const f = found.get(key) ?? {
					walk: c.walk,
					via: c.via,
					path: c.path,
					kind: d.kind,
					runs: [],
					weight: 0,
					details: []
				}
				if (!f.kind.includes(d.kind)) f.kind = d.kind.length > f.kind.length ? d.kind : f.kind
				f.runs.push(String(run))
				f.weight = Math.max(f.weight, d.weight)
				f.details.push(d.detail)
				found.set(key, f)
			}
		}
		raw.push({
			run,
			colds: Object.fromEntries(colds),
			colds2: Object.fromEntries(colds2),
			checkpoints
		})
		console.log(
			`  run ${run}: ${checkpoints.length} checkpoints, ${count} differences · ${Math.round((performance.now() - t0) / 1000)}s`
		)
	}
	ab('close')
	browser.close()

	const findings = [...found.values()].sort(
		(a, b) => b.runs.length - a.runs.length || b.weight - a.weight
	)
	const date = new Date().toISOString()
	const stem = join(RESULTS_DIR, date.slice(0, 19).replace(/[:T]/g, '-'))
	writeFileSync(
		`${stem}.json`,
		JSON.stringify({date, base: BASE, commit, runs: RUNS, raw}, null, 2)
	)
	const lines = findings.map((f) => {
		const n = f.runs.length
		const tag = n === RUNS ? `reproduced ${n} of ${RUNS}` : `flaky, ${n} of ${RUNS}`
		return `- \`${f.path}\` after ${f.walk}: ${f.details[0]}. Walk: ${f.via}. ${tag}.`
	})
	const md = [
		`# Order findings`,
		``,
		`${date.slice(0, 16).replace('T', ' ')} · ${args.url ? BASE : `${args.rev} ${commit.slice(0, 8)}`} · ${walks.length} walks, ${paths.length} pages, ${RUNS} runs · \`bun run test:order\``,
		``,
		`Each line: a page, the walk that reached it, and what differed from loading that URL cold. Reproduced in every run first, then by damage: no rows, missing or extra rows, wrong url, stuck loading, wrong count, wrong order.`,
		``,
		...(lines.length ? lines : ['None.']),
		``,
		`## Pages that differ from themselves cold`,
		``,
		...(coldNoise.length ? coldNoise.map((l) => `- ${l}`) : ['None.']),
		``
	].join('\n')
	writeFileSync(`${stem}.md`, md)
	if (args.out) writeFileSync(args.out, md)
	console.log(`\n${lines.join('\n') || 'no findings'}`)
	if (coldNoise.length) console.log(`\ncold noise:\n${coldNoise.join('\n')}`)
	console.log(
		`\n${findings.length} findings · ${Math.round((performance.now() - t0) / 1000)}s · saved ${stem}.md and .json`
	)
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err.message ?? err)
		process.exit(1)
	})
