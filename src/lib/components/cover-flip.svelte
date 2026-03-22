<script>
	import {createLoop} from '$lib/loop.ts'
	import {untrack} from 'svelte'

	/** @type {{
	 *  items: any[],
	 *  scrollItemsPerNotch?: number,
	 *  orientation?: 'vertical' | 'horizontal',
	 *  class?: string,
	 *  item: (args: {item: any, index: number, active: boolean}) => any,
	 *  active: (args: {item: any, index: number}) => any,
	 * }} */
	let {
		items,
		scrollItemsPerNotch = 1,
		orientation = 'vertical',
		class: extraClass = '',
		item,
		active,
		...rest
	} = $props()
	let container = $state()
	let loop
	let activeIndex = $state(-1)
	const instanceId = $props.id()
	const getItemId = (index) => `${instanceId}-item-${index}`
	const isHorizontal = $derived(orientation === 'horizontal')

	$effect(() => {
		const elements = container?.children
		if (!elements?.length) return
		void items

		const l = untrack(() => {
			return createLoop(elements, {
				paused: true,
				draggable: true,
				center: true,
				axis: isHorizontal ? 'x' : 'y',
				wheel: {itemsPerNotch: scrollItemsPerNotch},
				onChange: (_element, index) => {
					activeIndex = index
				},
				onClickItem: (_element, index) => {
					handleClick(index)
				}
			})
		})
		loop = l
		activeIndex = l.current()

		return () => l?.kill?.()
	})

	const tweenVars = {duration: 0.3, ease: 'power2.out'}

	const handleClick = (index) => {
		if (!loop) return
		loop.toIndex(index, tweenVars)
	}

	const handleKeydown = (event) => {
		if (!loop) return
		const forwardKeys = isHorizontal ? ['ArrowRight', 'l'] : ['ArrowDown', 'j']
		const backwardKeys = isHorizontal ? ['ArrowLeft', 'h'] : ['ArrowUp', 'k']
		if (forwardKeys.includes(event.key)) {
			event.preventDefault()
			loop.next(tweenVars)
		} else if (backwardKeys.includes(event.key)) {
			event.preventDefault()
			loop.previous(tweenVars)
		}
	}
</script>

<section
	class={`CoverFlip${isHorizontal ? ' CoverFlip--horizontal' : ''}${extraClass ? ' ' + extraClass : ''}`}
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
			class:active={index === activeIndex}
			id={getItemId(index)}
			role="option"
			aria-selected={index === activeIndex}
			tabindex="-1"
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
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		overflow: hidden;
	}

	.CoverFlip--horizontal {
		flex-direction: row;
		max-width: 100%;
	}

	.CoverFlip-item {
		flex-shrink: 0;
		cursor: pointer;
		will-change: transform;
	}
</style>
