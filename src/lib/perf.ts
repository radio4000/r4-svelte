// How R4 feels in use, measured. Off unless asked for: open any page with `?perf`
// and it stays on in that browser until `?perf=0`. Off, spans are no-ops and no
// observers run. Nothing is sent anywhere. See docs/performance.md.
//
// Every click, tap or keypress whose work takes over SLOW_MS lands in
// `perfReport().slow`, with what was touched, the route, and what kept the main
// thread busy. `span('area:what')` names a stretch of work as a User Timing
// measure, so slow taps and DevTools traces can say what ran. The bench diffs
// spans by name: keep them few and stable.

import {LOCAL_STORAGE_KEYS} from '#lib/storage-keys.js'

const PREFIX = 'r5:'
const SLOW_MS = 200
const QUIET_MS = 1000
const KEEP = 50

function readEnabled() {
	if (typeof window === 'undefined' || typeof performance?.mark !== 'function') return false
	try {
		const param = new URLSearchParams(location.search).get('perf')
		if (param === '0') localStorage.removeItem(LOCAL_STORAGE_KEYS.perf)
		else if (param !== null) localStorage.setItem(LOCAL_STORAGE_KEYS.perf, '1')
		return localStorage.getItem(LOCAL_STORAGE_KEYS.perf) === '1'
	} catch {
		return false
	}
}

/** True when measuring is switched on for this browser (`?perf`). */
export const perfEnabled = readEnabled()

type Detail = Record<string, unknown>

const noop = () => 0

/** Start a span. Call the returned function to end it; returns duration in ms. */
export function span(name: string, detail?: Detail): (extra?: Detail) => number {
	if (!perfEnabled) return noop
	const start = performance.now()
	return (extra) => {
		const end = performance.now()
		try {
			performance.measure(PREFIX + name, {start, end, detail: {...detail, ...extra}})
		} catch {
			// detail wasn't structured-cloneable
			performance.measure(PREFIX + name, {start, end})
		}
		return end - start
	}
}

export type SlowInteraction = {
	type: 'tap' | 'key'
	/** What was touched, e.g. `button "Shuffle"` */
	target: string
	route: string
	/** Where it led, if the route changed */
	to?: string
	/** Input until the main thread went quiet, ms */
	ms: number
	/** Input until first paint, all the browser's own INP sees, ms */
	firstPaint: number
	/** Long-frame blocking time in that stretch, ms */
	blocking: number
	/** Spans of 5ms or more that overlapped it */
	spans: string[]
	/** Longest scripts in its long frames, e.g. `BUTTON.onclick 180ms` */
	scripts: string[]
	at: number
}

type Frame = PerformanceEntry & {
	blockingDuration?: number
	scripts?: {invoker: string; sourceURL: string; duration: number}[]
}
type Input = {at: number; route: string; target: string}

const frames: Frame[] = []
const slow: SlowInteraction[] = []
const inputs: Input[] = []
// LCP entries are only delivered to observers, not getEntriesByType.
let lcp = 0

const round = (n: number) => Math.round(n * 10) / 10
const sum = (xs: Frame[], f: (x: Frame) => number) => xs.reduce((n, x) => n + f(x), 0)
const measures = () =>
	(performance.getEntriesByType('measure') as PerformanceMeasure[]).filter((m) =>
		m.name.startsWith(PREFIX)
	)

function describe(el: Element | null | undefined) {
	const hit = el?.closest('button, a, input, select, textarea, [role], label') ?? el
	if (!hit) return 'unknown'
	const tag = hit.tagName.toLowerCase()
	const label =
		hit.getAttribute('aria-label') ||
		hit.getAttribute('title') ||
		(hit instanceof HTMLInputElement ? hit.type : hit.textContent)
	const text = label?.trim().replace(/\s+/g, ' ').slice(0, 40)
	return text ? `${tag} "${text}"` : tag
}

function observe(type: string, onEntry: (e: PerformanceEntry) => void, opts = {}) {
	if (!perfEnabled || typeof PerformanceObserver === 'undefined') return
	try {
		new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({
			type,
			buffered: true,
			...opts
		})
	} catch {
		// unsupported entry type
	}
}

observe('largest-contentful-paint', (e) => (lcp = e.startTime))

observe('long-animation-frame', (e) => {
	frames.push(e)
	if (frames.length > 500) frames.shift()
	wait()
})

// Timing entries arrive after the frame: by then a navigation may have changed the
// URL and the touched element may be gone (play swaps the artwork button for an
// img). So note both at input time.
if (perfEnabled) {
	for (const type of ['pointerdown', 'keydown']) {
		addEventListener(
			type,
			(e) => {
				inputs.push({
					at: e.timeStamp,
					route: location.pathname,
					target: describe(e.target as Element)
				})
				if (inputs.length > 20) inputs.shift()
			},
			{capture: true, passive: true}
		)
	}
}

// The browser's own interaction timing stops at the first paint, but in R4 the
// heavy part usually comes after: a click starts a navigation or a query and the
// page freezes a few frames later. So an interaction owns every long frame that
// follows it until the main thread has been quiet for QUIET_MS, or the next
// interaction starts. One input fires several entries (pointerdown, pointerup,
// click) sharing an interactionId; the first stands for all.
type TimingEntry = PerformanceEntry & {interactionId?: number; target?: Element | null}
let pending: (Input & {entry: TimingEntry}) | null = null
let quiet: ReturnType<typeof setTimeout> | undefined
let lastInteraction = 0

observe(
	'event',
	(e) => {
		const entry = e as TimingEntry
		if (!entry.interactionId || entry.interactionId === lastInteraction) return
		lastInteraction = entry.interactionId
		finish(entry.startTime)
		const input = inputs.findLast((i) => i.at <= entry.startTime)
		pending = {
			entry,
			at: entry.startTime,
			route: input?.route ?? location.pathname,
			target: input?.target ?? describe(entry.target)
		}
		wait()
	},
	{durationThreshold: 16}
)

function wait() {
	clearTimeout(quiet)
	if (pending) quiet = setTimeout(finish, QUIET_MS)
}

function finish(before = Infinity) {
	clearTimeout(quiet)
	const p = pending
	pending = null
	if (!p) return
	const start = p.at
	const own = frames.filter((f) => f.startTime + f.duration > start && f.startTime < before)
	const end = Math.max(start + p.entry.duration, ...own.map((f) => f.startTime + f.duration))
	if (end - start < SLOW_MS) return
	slow.push({
		type: p.entry.name.startsWith('key') ? 'key' : 'tap',
		target: p.target,
		route: p.route,
		...(location.pathname !== p.route && {to: location.pathname}),
		ms: Math.round(end - start),
		firstPaint: Math.round(p.entry.duration),
		blocking: Math.round(sum(own, (f) => f.blockingDuration ?? 0)),
		spans: measures()
			.filter((m) => m.duration >= 5 && m.startTime < end && start < m.startTime + m.duration)
			.map((m) => `${m.name.slice(PREFIX.length)} ${Math.round(m.duration)}ms`),
		scripts: own
			.flatMap((f) => f.scripts ?? [])
			.sort((a, b) => b.duration - a.duration)
			.slice(0, 3)
			.map((s) => {
				const file = s.sourceURL.split('/').pop()
				return `${s.invoker} ${Math.round(s.duration)}ms${file ? ` (${file})` : ''}`
			}),
		at: Math.round(start)
	})
	if (slow.length > KEEP) slow.shift()
}

type SpanStats = {count: number; total: number; max: number; last: number; detail?: unknown}

/**
 * Snapshot of everything measured since `since` (ms, performance.now timebase).
 * Spans are grouped by name; `detail` is the last occurrence's.
 */
export function perfReport(since = 0) {
	const spans: Record<string, SpanStats> = {}
	for (const m of measures()) {
		if (m.startTime < since) continue
		const name = m.name.slice(PREFIX.length)
		spans[name] ??= {count: 0, total: 0, max: 0, last: 0}
		const s = spans[name]
		s.count++
		s.total = round(s.total + m.duration)
		s.max = round(Math.max(s.max, m.duration))
		s.last = round(m.duration)
		s.detail = m.detail
	}
	const recent = frames.filter((f) => f.startTime >= since)
	const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0
	const memory = (performance as Performance & {memory?: {usedJSHeapSize: number}}).memory
	return {
		enabled: perfEnabled,
		now: round(performance.now()),
		spans,
		slow: slow.filter((s) => s.at >= since),
		longFrames: {
			count: recent.length,
			total: round(sum(recent, (f) => f.duration)),
			blocking: round(sum(recent, (f) => f.blockingDuration ?? 0)),
			max: round(Math.max(0, ...recent.map((f) => f.duration)))
		},
		fcp: round(fcp),
		lcp: round(lcp),
		heapMB: memory ? round(memory.usedJSHeapSize / 1024 / 1024) : undefined
	}
}

/** Clear spans, long frames and slow interactions, so the next report covers only what follows. */
export function perfReset() {
	if (perfEnabled) performance.clearMeasures()
	frames.length = 0
	slow.length = 0
}
