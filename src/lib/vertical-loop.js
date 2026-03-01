import {gsap, Draggable, InertiaPlugin} from '$lib/animations.js'
import {logger} from '$lib/logger'

const log = logger.ns('vertical-loop').seal()

const AXIS_CONFIGS = {
	x: {
		axis: 'x',
		sizeProp: 'width',
		domSizeProp: 'offsetWidth',
		offsetProp: 'offsetLeft',
		translateProp: 'x',
		translatePercentProp: 'xPercent',
		scaleProp: 'scaleX',
		boundsStartProp: 'left',
		boundsEndProp: 'right',
		containerSizeProp: 'clientWidth',
		dragProp: 'x',
		startProp: 'startX'
	},
	y: {
		axis: 'y',
		sizeProp: 'height',
		domSizeProp: 'offsetHeight',
		offsetProp: 'offsetTop',
		translateProp: 'y',
		translatePercentProp: 'yPercent',
		scaleProp: 'scaleY',
		boundsStartProp: 'top',
		boundsEndProp: 'bottom',
		containerSizeProp: 'clientHeight',
		dragProp: 'y',
		startProp: 'startY'
	}
}

gsap.registerPlugin(Draggable, InertiaPlugin)

/**
 * This helper function makes a group of elements animate along a single axis in a seamless, responsive loop.
 * Uses axis-based percents so that even if the dimensions change (like if the window gets resized), it should still work in most cases.
 * When each item animates enough along the axis, it loops back to the other side.
 *
 * @param {NodeList|Array<HTMLElement>|string} items - Elements (or selector) to loop.
 * @param {Object} [config] - Loop configuration.
 * @param {boolean} [config.draggable=false] - Enable momentum dragging via GSAP Draggable.
 * @param {boolean|Element|string|Array<Element>} [config.center=false] - Center active item. `true` uses the items' parent; element/selector uses that container.
 * @param {'x'|'y'|'horizontal'|'vertical'} [config.axis='y'] - Axis to animate on.
 * @param {number} [config.speed=1] - Scroll speed multiplier (1 ≈ 100px/sec).
 * @param {boolean} [config.paused=false] - Start the timeline paused.
 * @param {number} [config.repeat] - Number of repeats for the timeline (GSAP `repeat`).
 * @param {boolean} [config.reversed=false] - Start with the timeline reversed.
 * @param {number|string} [config.paddingBottom=0] - Extra bottom spacing (px); string is parsed with `parseFloat`.
 * @param {false|number|((v:number)=>number)} [config.snap=1] - Snap granularity. `false` disables; number = increment; function = custom snap.
 * @param {(el:Element, index:number)=>void} [config.onChange] - Called when the closest/active item changes.
 */
export function verticalLoop(items, config = {}) {
	items = gsap.utils.toArray(items)

	// Axis config
	const axisSetting = config.axis
	const axisKey = axisSetting === 'horizontal' || axisSetting === 'x' ? 'x' : 'y'
	const axisConfig = AXIS_CONFIGS[axisKey]
	const {
		sizeProp,
		domSizeProp,
		offsetProp,
		translateProp,
		translatePercentProp,
		scaleProp,
		boundsStartProp,
		boundsEndProp,
		containerSizeProp
	} = axisConfig

	// Early setup
	const length = items.length
	const startOffset = items[0][offsetProp]
	const pixelsPerSecond = (config.speed || 1) * 100
	const container = getContainer(config.center, items)

	// State arrays
	const times = []
	const sizes = []
	const spaceBefore = []
	const percents = []

	// State variables
	let curIndex = 0
	let lastIndex = 0
	let indexIsDirty = false
	let totalDistance
	let timeOffset = 0
	let timeWrap
	let proxy

	// Create timeline
	const tl = createTimeline(config, items, () => lastIndex)

	// Helper functions
	const snap = createSnapFunction(config.snap)
	const getTotalDistance = () => {
		const lastItem = items[length - 1]
		const scale = Number(gsap.getProperty(lastItem, scaleProp)) || 1
		return (
			lastItem[offsetProp] +
			(percents[length - 1] / 100) * sizes[length - 1] -
			startOffset +
			spaceBefore[0] +
			lastItem[domSizeProp] * scale +
			(Number(config.paddingBottom) || 0)
		)
	}

	const populateSizes = () => {
		let b1 = container.getBoundingClientRect()
		let b2

		items.forEach((el, i) => {
			// Dimensions need to be numeric; fallback to DOM offsets when CSS returns non-px units.
			const elSize = Number(gsap.getProperty(el, sizeProp)) || el[domSizeProp] || 1
			const elTranslate = Number(gsap.getProperty(el, translateProp)) || 0
			const elPercent = Number(gsap.getProperty(el, translatePercentProp)) || 0
			sizes[i] = elSize
			percents[i] = snap((elTranslate / elSize) * 100 + elPercent)
			b2 = el.getBoundingClientRect()
			spaceBefore[i] = b2[boundsStartProp] - (i ? b1[boundsEndProp] : b1[boundsStartProp])
			b1 = b2
		})

		gsap.set(items, {[translatePercentProp]: (i) => percents[i]})
		totalDistance = getTotalDistance()
	}

	const populateOffsets = () => {
		if (!config.center) return

		timeOffset = (tl.duration() * (container[containerSizeProp] / 2)) / totalDistance
		times.forEach((_t, i) => {
			times[i] = timeWrap(tl.labels[`label${i}`] + (tl.duration() * sizes[i]) / 2 / totalDistance - timeOffset)
		})
	}

	const getClosest = (values, value, wrap) => {
		let closest = 1e10
		let index = 0

		for (let i = values.length - 1; i >= 0; i--) {
			let d = Math.abs(values[i] - value)
			if (d > wrap / 2) d = wrap - d
			if (d < closest) {
				closest = d
				index = i
			}
		}
		return index
	}

	const populateTimeline = () => {
		tl.clear()

		for (let i = 0; i < length; i++) {
			const item = items[i]
			const curPos = (percents[i] / 100) * sizes[i]
			const distanceToStart = item[offsetProp] + curPos - startOffset + spaceBefore[0]
			const scale = Number(gsap.getProperty(item, scaleProp)) || 1
			const distanceToLoop = distanceToStart + sizes[i] * scale

			// Animation to loop point
			tl.to(
				item,
				{
					[translatePercentProp]: snap(((curPos - distanceToLoop) / sizes[i]) * 100),
					duration: distanceToLoop / pixelsPerSecond
				},
				0
			)

			// Animation from loop back
			tl.fromTo(
				item,
				{
					[translatePercentProp]: snap(((curPos - distanceToLoop + totalDistance) / sizes[i]) * 100)
				},
				{
					[translatePercentProp]: percents[i],
					duration: (curPos - distanceToLoop + totalDistance - curPos) / pixelsPerSecond,
					immediateRender: false
				},
				distanceToLoop / pixelsPerSecond
			)

			tl.add(`label${i}`, distanceToStart / pixelsPerSecond)
			times[i] = distanceToStart / pixelsPerSecond
		}

		timeWrap = gsap.utils.wrap(0, tl.duration())
	}

	const refresh = (deep) => {
		const progress = tl.progress()
		tl.progress(0, true)
		populateSizes()

		if (deep) {
			populateTimeline()
			if (tl.draggable && tl.paused()) {
				tl.time(times[curIndex], true)
				return
			}
		}

		populateOffsets()
		tl.progress(progress, true)
	}

	const onResize = () => refresh(true)
	// Initialize
	gsap.set(items, {[translateProp]: 0})
	populateSizes()
	populateTimeline()
	populateOffsets()

	// Navigation methods
	const toIndex = (index, vars = {}) => {
		// Always go in the shortest direction
		if (Math.abs(index - curIndex) > length / 2) {
			index += index > curIndex ? -length : length
		}

		const newIndex = gsap.utils.wrap(0, length, index)
		let time = times[newIndex]

		// Adjust for timeline wrapping
		if (time > tl.time() !== index > curIndex && index !== curIndex) {
			time += tl.duration() * (index > curIndex ? 1 : -1)
		}

		if (time < 0 || time > tl.duration()) {
			vars.modifiers = {time: timeWrap}
		}

		curIndex = newIndex
		vars.overwrite = true
		gsap.killTweensOf(proxy)

		return vars.duration === 0 ? tl.time(timeWrap(time)) : tl.tweenTo(time, vars)
	}
	// API methods
	tl.toIndex = toIndex
	tl.closestIndex = (setCurrent) => {
		const index = getClosest(times, tl.time(), tl.duration())
		if (setCurrent) {
			curIndex = index
			indexIsDirty = false
		}
		return index
	}
	tl.current = () => (indexIsDirty ? tl.closestIndex(true) : curIndex)
	tl.next = (vars) => toIndex(tl.current() + 1, vars)
	tl.previous = (vars) => toIndex(tl.current() - 1, vars)
	tl.times = times
	// Pre-render and handle config
	tl.progress(1, true).progress(0, true)

	if (config.reversed) {
		tl.vars.onReverseComplete?.()
		tl.reverse()
	}

	// Setup dragging
	if (config.draggable && typeof Draggable === 'function') {
		const draggableSetup = setupDraggable(
			tl,
			items,
			totalDistance,
			times,
			timeWrap,
			getClosest,
			refresh,
			() => indexIsDirty,
			(val) => {
				indexIsDirty = val
			},
			axisConfig
		)
		proxy = draggableSetup.proxy
		tl.draggable = draggableSetup.draggable
	}
	// Final setup
	tl.closestIndex(true)
	lastIndex = curIndex
	if (config.onChange) config.onChange(items[curIndex], curIndex)

	// Cleanup
	window.addEventListener('resize', onResize)
	const cleanup = () => window.removeEventListener('resize', onResize)

	// Store cleanup in context if using gsap.context
	// @ts-expect-error - gsap.context.current exists at runtime
	if (gsap.context?.current) {
		// @ts-expect-error - GSAP context might not exist or be typed in this environment
		gsap.context.current.add(cleanup)
	}

	return tl
}

// Helper functions moved outside main function
function getContainer(center, items) {
	if (!center) return items[0].parentNode
	if (center === true) return items[0].parentNode
	return gsap.utils.toArray(center)[0] || items[0].parentNode
}

function createSnapFunction(snapConfig) {
	if (snapConfig === false) return (v) => v
	return gsap.utils.snap(snapConfig || 1)
}

function createTimeline(config, items, getLastIndex) {
	let localLastIndex = 0
	return gsap.timeline({
		repeat: config.repeat,
		onUpdate: function () {
			if (!config.onChange) return
			const i = this.closestIndex()
			const currentLastIndex = typeof getLastIndex === 'function' ? getLastIndex() : localLastIndex
			if (currentLastIndex !== i) {
				localLastIndex = i
				config.onChange(items[i], i)
			}
		},
		paused: config.paused,
		defaults: {ease: 'none'},
		onReverseComplete: function () {
			this.totalTime(this.rawTime() + this.duration() * 100)
		}
	})
}

function setupDraggable(
	tl,
	items,
	totalDistance,
	times,
	timeWrap,
	getClosest,
	refresh,
	_getIndexIsDirty,
	setIndexIsDirty,
	axisConfig
) {
	if (typeof InertiaPlugin === 'undefined') {
		log.warn('InertiaPlugin required for momentum-based scrolling and snapping', {url: 'https://greensock.com/club'})
	}

	const proxy = document.createElement('div')
	const wrap = gsap.utils.wrap(0, 1)
	let ratio, startProgress, lastSnap, initChange, wasPlaying
	const {axis, dragProp, startProp} = axisConfig

	const align = () => tl.progress(wrap(startProgress + (draggable[startProp] - draggable[dragProp]) * ratio))
	const syncIndex = () => tl.closestIndex(true)

	const draggable = Draggable.create(proxy, {
		trigger: items[0].parentNode,
		type: axis,
		inertia: true,
		overshootTolerance: 0,

		onPressInit() {
			const current = this[dragProp]
			gsap.killTweensOf(tl)
			wasPlaying = !tl.paused()
			tl.pause()
			startProgress = tl.progress()
			refresh()
			ratio = 1 / totalDistance
			initChange = startProgress / -ratio - current
			gsap.set(proxy, {[dragProp]: startProgress / -ratio})
		},

		onDrag: align,
		onThrowUpdate: align,

		snap(value) {
			// Handle edge case for small movements
			if (Math.abs(startProgress / -ratio - this[dragProp]) < 10) {
				return lastSnap + initChange
			}

			const time = -(value * ratio) * tl.duration()
			const wrappedTime = timeWrap(time)
			const snapTime = times[getClosest(times, wrappedTime, tl.duration())]
			let dif = snapTime - wrappedTime

			if (Math.abs(dif) > tl.duration() / 2) {
				dif += dif < 0 ? tl.duration() : -tl.duration()
			}

			lastSnap = (time + dif) / tl.duration() / -ratio
			return lastSnap
		},

		onRelease() {
			syncIndex()
			if (draggable.isThrowing) setIndexIsDirty(true)
		},

		onThrowComplete() {
			syncIndex()
			if (wasPlaying) tl.play()
		}
	})[0]

	return {proxy, draggable}
}
