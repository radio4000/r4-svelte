<script>
	import gsap from 'gsap'
	import {verticalLoop} from '$lib/vertical-loop.js'

	/** @type {{
	 *  items: any[],
	 *  scrollItemsPerNotch?: number,
	 *  orientation?: 'vertical' | 'horizontal',
	 *  item: (args: {item: any, index: number, active: boolean}) => any,
	 *  active: (args: {item: any, index: number}) => any,
	 * }} */
	let {items, scrollItemsPerNotch = 1, orientation = 'vertical', item, active, ...rest} = $props()
	let container = $state()
	let loop
	let activeElement
	let activeIndex = $state(-1)
	const instanceId =
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `cover-flip-${Math.random().toString(36).slice(2)}`
	const getItemId = (index) => `${instanceId}-item-${index}`
	const isHorizontal = $derived(orientation === 'horizontal')

	$effect(() => {
		const elements = container?.children
		if (!elements.length) return

		loop = verticalLoop(elements, {
			paused: true,
			draggable: true,
			center: true,
			axis: isHorizontal ? 'x' : 'y',
			onChange: (element, index) => {
				activeElement?.classList.remove('active')
				element.classList.add('active')
				activeElement = element
				activeIndex = index
			}
		})

		// Direct scrolling without animation
		const wrapTime = gsap.utils.wrap(0, loop.duration())
		const timePerItem = loop.duration() / elements.length
		let playhead = {time: 0}

		function normalizeWheel(e) {
			// Normalize delta to discrete notches
			let delta = isHorizontal ? e.deltaX : e.deltaY
			if (isHorizontal && delta === 0 && e.deltaY !== 0) {
				delta = e.deltaY
			}
			if (e.deltaMode === 1) {
				delta *= 16
			} else if (e.deltaMode === 2) {
				delta *= (isHorizontal ? container?.clientWidth : container?.clientHeight) || 400
			}
			// Return normalized notches (typically -1 or 1)
			return Math.sign(delta) * Math.max(1, Math.abs(delta) / 100)
		}

		const handleWheel = (e) => {
			e.preventDefault()
			const notches = normalizeWheel(e)
			const deltaTime = notches * scrollItemsPerNotch * timePerItem
			playhead.time += deltaTime
			loop.time(wrapTime(playhead.time))
		}

		container.addEventListener('wheel', handleWheel, {passive: false})

		return () => {
			container?.removeEventListener('wheel', handleWheel)
			loop?.kill?.()
		}
	})

	const handleClick = (index) => {
		if (!loop) return
		loop.toIndex(index, {duration: 0, ease: 'power1.easeInOut'})
	}

	const handleKeydown = (event) => {
		if (!loop) return
		const forwardKeys = isHorizontal ? ['ArrowRight', 'l'] : ['ArrowDown', 'j']
		const backwardKeys = isHorizontal ? ['ArrowLeft', 'h'] : ['ArrowUp', 'k']
		if (forwardKeys.includes(event.key)) {
			event.preventDefault()
			loop.next({duration: 0})
		} else if (backwardKeys.includes(event.key)) {
			event.preventDefault()
			loop.previous({duration: 0})
		}
	}
</script>

<section
	class={`CoverFlip${isHorizontal ? ' CoverFlip--horizontal' : ''}`}
	bind:this={container}
	tabindex="0"
	role="listbox"
	aria-label="Cover flip"
	aria-orientation={isHorizontal ? 'horizontal' : 'vertical'}
	aria-activedescendant={activeIndex > -1 ? getItemId(activeIndex) : undefined}
	onkeydown={handleKeydown}
	{...rest}
>
	{#each items as itemData, index (index)}
		<div
			class="CoverFlip-item"
			id={getItemId(index)}
			role="option"
			aria-selected={index === activeIndex}
			tabindex="-1"
			onclick={() => handleClick(index)}
		>
			{@render item({item: itemData, index, active: index === activeIndex})}
		</div>
	{/each}
</section>

{#if activeIndex > -1 && items[activeIndex]}
	{@render active({item: items[activeIndex], index: activeIndex})}
{/if}

<style>
	.CoverFlip {
		width: 30%;
		height: 50vh;
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		overflow: hidden;
	}

	.CoverFlip-item {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 10%;
		flex-shrink: 0;
		cursor: pointer;
	}

	.CoverFlip--horizontal {
		width: 60%;
		height: 30vh;
		flex-direction: row;
	}

	.CoverFlip--horizontal .CoverFlip-item {
		width: 10%;
		height: auto;
	}
</style>
