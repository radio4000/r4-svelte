import {gsap, Draggable, InertiaPlugin} from '$lib/animations.js'
import {logger} from '$lib/logger'

const log = logger.ns('loop').seal()

gsap.registerPlugin(Draggable, InertiaPlugin)

const AXIS = {
	x: {
		size: 'width',
		domSize: 'offsetWidth',
		offset: 'offsetLeft',
		translate: 'x',
		translatePct: 'xPercent',
		scale: 'scaleX',
		start: 'left',
		end: 'right',
		containerSize: 'clientWidth',
		drag: 'x',
		dragStart: 'startX'
	},
	y: {
		size: 'height',
		domSize: 'offsetHeight',
		offset: 'offsetTop',
		translate: 'y',
		translatePct: 'yPercent',
		scale: 'scaleY',
		start: 'top',
		end: 'bottom',
		containerSize: 'clientHeight',
		drag: 'y',
		dragStart: 'startY'
	}
} as const

export interface LoopConfig {
	axis?: 'x' | 'y' | 'horizontal' | 'vertical'
	speed?: number
	paused?: boolean
	repeat?: number
	reversed?: boolean
	paddingBottom?: number | string
	snap?: false | number | ((v: number) => number)
	draggable?: boolean
	center?: boolean | Element | string
	wheel?: boolean | {itemsPerNotch?: number}
	onChange?: (el: Element, index: number) => void
	onClickItem?: (el: Element, index: number) => void
}

export interface Loop {
	toIndex(index: number, vars?: gsap.TweenVars): gsap.core.Timeline | gsap.core.Tween
	next(vars?: gsap.TweenVars): gsap.core.Timeline | gsap.core.Tween
	previous(vars?: gsap.TweenVars): gsap.core.Timeline | gsap.core.Tween
	current(): number
	closestIndex(setCurrent?: boolean): number
	times: number[]
	kill(): void
}

interface Measured {
	sizes: number[]
	percents: number[]
	spaceBefore: number[]
	totalDistance: number
}

function findClosest(values: number[], value: number, wrapAt: number): number {
	let best = 1e10
	let index = 0
	for (let i = values.length - 1; i >= 0; i--) {
		let d = Math.abs(values[i] - value)
		if (d > wrapAt / 2) d = wrapAt - d
		if (d < best) {
			best = d
			index = i
		}
	}
	return index
}

export function createLoop(
	items: HTMLElement[] | NodeList | string,
	config: LoopConfig = {}
): Loop {
	const els = gsap.utils.toArray(items) as HTMLElement[]
	const axisKey = config.axis === 'horizontal' || config.axis === 'x' ? 'x' : 'y'
	const ax = AXIS[axisKey]
	const snap =
		config.snap === false
			? (v: number) => v
			: typeof config.snap === 'function'
				? config.snap
				: gsap.utils.snap(config.snap || 1)
	const length = els.length
	const startOffset = els[0][ax.offset]
	const pxPerSec = (config.speed || 1) * 100
	const container = (
		config.center && config.center !== true
			? gsap.utils.toArray(config.center)[0] || els[0].parentNode
			: els[0].parentNode
	) as HTMLElement

	// State — shared mutable references read by closures
	const times: number[] = []
	let measured: Measured = {sizes: [], percents: [], spaceBefore: [], totalDistance: 0}
	let curIndex = 0
	let lastIndex = 0
	let indexIsDirty = false
	let timeWrap: (t: number) => number = (t) => t
	let proxy: HTMLElement | undefined
	let draggableInstance: Draggable

	const tl = gsap.timeline({
		repeat: config.repeat,
		paused: config.paused,
		defaults: {ease: 'none'},
		onUpdate() {
			if (!config.onChange) return
			const i = closestIndex()
			if (lastIndex !== i) {
				lastIndex = i
				config.onChange(els[i], i)
			}
		},
		onReverseComplete() {
			this.totalTime(this.rawTime() + this.duration() * 100)
		}
	})

	function closestIndex(setCurrent?: boolean): number {
		const index = findClosest(times, tl.time(), tl.duration())
		if (setCurrent) {
			curIndex = index
			indexIsDirty = false
		}
		return index
	}

	// --- Pipeline: measure → build → center ---

	function measure(): Measured {
		const sizes: number[] = []
		const percents: number[] = []
		const spaceBefore: number[] = []
		let rect = container.getBoundingClientRect()
		els.forEach((el, i) => {
			sizes[i] = Number(gsap.getProperty(el, ax.size)) || el[ax.domSize] || 1
			const translate = Number(gsap.getProperty(el, ax.translate)) || 0
			const pct = Number(gsap.getProperty(el, ax.translatePct)) || 0
			percents[i] = snap((translate / sizes[i]) * 100 + pct)
			const r = el.getBoundingClientRect()
			spaceBefore[i] = r[ax.start] - (i ? rect[ax.end] : rect[ax.start])
			rect = r
		})
		gsap.set(els, {[ax.translatePct]: (i: number) => percents[i]})

		const last = els[length - 1]
		const scale = Number(gsap.getProperty(last, ax.scale)) || 1
		const totalDistance =
			last[ax.offset] +
			(percents[length - 1] / 100) * sizes[length - 1] -
			startOffset +
			spaceBefore[0] +
			last[ax.domSize] * scale +
			(Number(config.paddingBottom) || 0)

		return {sizes, percents, spaceBefore, totalDistance}
	}

	function build(m: Measured): {times: number[]; timeWrap: (t: number) => number} {
		tl.clear()
		const t: number[] = []
		for (let i = 0; i < length; i++) {
			const el = els[i]
			const pos = (m.percents[i] / 100) * m.sizes[i]
			const toStart = el[ax.offset] + pos - startOffset + m.spaceBefore[0]
			const scale = Number(gsap.getProperty(el, ax.scale)) || 1
			const toLoop = toStart + m.sizes[i] * scale

			tl.to(
				el,
				{[ax.translatePct]: snap(((pos - toLoop) / m.sizes[i]) * 100), duration: toLoop / pxPerSec},
				0
			)
			tl.fromTo(
				el,
				{[ax.translatePct]: snap(((pos - toLoop + m.totalDistance) / m.sizes[i]) * 100)},
				{
					[ax.translatePct]: m.percents[i],
					duration: (m.totalDistance - toLoop) / pxPerSec,
					immediateRender: false
				},
				toLoop / pxPerSec
			)
			tl.add(`label${i}`, toStart / pxPerSec)
			t[i] = toStart / pxPerSec
		}
		return {times: t, timeWrap: gsap.utils.wrap(0, tl.duration())}
	}

	function center(t: number[], m: Measured, tw: (v: number) => number): number[] {
		if (!config.center) return t
		const half = container[ax.containerSize] / 2
		return t.map((_, i) =>
			tw(
				tl.labels[`label${i}`] +
					(tl.duration() * m.sizes[i]) / 2 / m.totalDistance -
					(tl.duration() * half) / m.totalDistance
			)
		)
	}

	function refresh(deep?: boolean) {
		const progress = tl.progress()
		tl.progress(0, true)
		measured = measure()
		if (deep) {
			const built = build(measured)
			timeWrap = built.timeWrap
			times.splice(0, Infinity, ...center(built.times, measured, built.timeWrap))
		} else {
			times.splice(0, Infinity, ...center(times, measured, timeWrap))
		}
		if (deep && draggableInstance && tl.paused()) {
			tl.time(times[curIndex], true)
		} else {
			tl.progress(progress, true)
		}
	}

	// --- Init ---

	gsap.set(els, {[ax.translate]: 0})
	refresh(true)

	// --- Navigation ---

	function toIndex(index: number, vars: gsap.TweenVars = {}) {
		if (Math.abs(index - curIndex) > length / 2) {
			index += index > curIndex ? -length : length
		}
		const newIndex = gsap.utils.wrap(0, length, index)
		let time = times[newIndex]
		if (time > tl.time() !== index > curIndex && index !== curIndex) {
			time += tl.duration() * (index > curIndex ? 1 : -1)
		}
		if (time < 0 || time > tl.duration()) vars.modifiers = {time: timeWrap}
		curIndex = newIndex
		vars.overwrite = true
		if (proxy) gsap.killTweensOf(proxy)
		return vars.duration === 0 ? tl.time(timeWrap(time)) : tl.tweenTo(time, vars)
	}

	// Pre-render
	tl.progress(1, true).progress(0, true)
	if (config.reversed) {
		tl.vars.onReverseComplete?.()
		tl.reverse()
	}

	// --- Input: drag & wheel ---

	function setupDraggable(): {proxy: HTMLElement; instance: Draggable} | undefined {
		if (!config.draggable || typeof Draggable !== 'function') return
		if (typeof InertiaPlugin === 'undefined') {
			log.warn('InertiaPlugin required for momentum-based scrolling', {
				url: 'https://greensock.com/club'
			})
		}
		const p = document.createElement('div')
		const progressWrap = gsap.utils.wrap(0, 1)
		let ratio: number, startProgress: number, lastSnap: number, wasPlaying: boolean

		const align = () => {
			tl.progress(
				progressWrap(
					startProgress + (draggableInstance[ax.dragStart] - draggableInstance[ax.drag]) * ratio
				)
			)
		}

		const instance = Draggable.create(p, {
			trigger: els[0].parentNode as Element,
			type: axisKey,
			inertia: true,
			overshootTolerance: 0,
			onPressInit() {
				const current = this[ax.drag]
				gsap.killTweensOf(tl)
				wasPlaying = !tl.paused()
				tl.pause()
				startProgress = tl.progress()
				refresh()
				ratio = 1 / measured.totalDistance
				gsap.set(p, {[ax.drag]: startProgress / -ratio})
			},
			onDrag: align,
			onThrowUpdate: align,
			snap(value: number) {
				if (Math.abs(startProgress / -ratio - this[ax.drag]) < 10) return startProgress / -ratio
				const t = -(value * ratio) * tl.duration()
				const wrapped = timeWrap(t)
				const snapTime = times[findClosest(times, wrapped, tl.duration())]
				let dif = snapTime - wrapped
				if (Math.abs(dif) > tl.duration() / 2) dif += dif < 0 ? tl.duration() : -tl.duration()
				lastSnap = (t + dif) / tl.duration() / -ratio
				return lastSnap
			},
			onClick(e: PointerEvent) {
				if (!config.onClickItem) return
				const clicked = els.find((el) => el === e.target || el.contains(e.target as Node))
				if (clicked) {
					const idx = els.indexOf(clicked)
					if (idx !== -1) config.onClickItem(clicked, idx)
				}
			},
			onRelease() {
				closestIndex(true)
				if (instance.isThrowing) indexIsDirty = true
			},
			onThrowComplete() {
				closestIndex(true)
				if (wasPlaying) tl.play()
			}
		})[0]

		return {proxy: p, instance}
	}

	function setupWheel(): (() => void) | undefined {
		if (!config.wheel) return
		const itemsPerNotch =
			(typeof config.wheel === 'object' ? config.wheel.itemsPerNotch : undefined) || 1
		const timePerItem = tl.duration() / length
		const isHorizontal = axisKey === 'x'
		const scrollProxy = {time: tl.time()}
		let scrollTarget = scrollProxy.time

		const handleWheel = (e: WheelEvent) => {
			e.preventDefault()
			let delta = isHorizontal ? e.deltaX : e.deltaY
			if (isHorizontal && delta === 0 && e.deltaY !== 0) delta = e.deltaY
			if (e.deltaMode === 1) delta *= 16
			else if (e.deltaMode === 2) delta *= container[ax.containerSize] || 400
			const notches = Math.sign(delta) * Math.max(1, Math.abs(delta) / 100)

			scrollTarget += notches * itemsPerNotch * timePerItem
			gsap.to(scrollProxy, {
				time: scrollTarget,
				duration: 0.4,
				ease: 'power2.out',
				overwrite: true,
				onUpdate: () => {
					tl.time(timeWrap(scrollProxy.time))
				}
			})
		}

		container.addEventListener('wheel', handleWheel, {passive: false})
		return () => {
			container.removeEventListener('wheel', handleWheel)
			gsap.killTweensOf(scrollProxy)
		}
	}

	const drag = setupDraggable()
	if (drag) {
		proxy = drag.proxy
		draggableInstance = drag.instance
	}
	const wheelCleanup = setupWheel()

	// --- Finalize ---

	closestIndex(true)
	lastIndex = curIndex
	config.onChange?.(els[curIndex], curIndex)

	const onResize = () => refresh(!draggableInstance?.isDragging)
	window.addEventListener('resize', onResize)

	return {
		toIndex,
		next: (vars?) => toIndex((indexIsDirty ? closestIndex(true) : curIndex) + 1, vars),
		previous: (vars?) => toIndex((indexIsDirty ? closestIndex(true) : curIndex) - 1, vars),
		current: () => (indexIsDirty ? closestIndex(true) : curIndex),
		closestIndex,
		times,
		kill() {
			window.removeEventListener('resize', onResize)
			wheelCleanup?.()
			tl.kill()
		}
	}
}
