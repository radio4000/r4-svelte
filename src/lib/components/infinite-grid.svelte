<script>
	import {resolve} from '$app/paths'
	import {gsap, Draggable, InertiaPlugin} from '$lib/animations.js'
	import ButtonPlay from '$lib/components/button-play.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import {InfiniteGrid, throttle} from '$lib/infinite-grid.js'

	gsap.registerPlugin(Draggable, InertiaPlugin)

	const {channels = []} = $props()

	const grid = new InfiniteGrid({
		cellWidth: 320,
		cellHeight: 320,
		gap: 30,
		viewportBuffer: 4,
		getContent: (x, y) => {
			//const itemIndex = Math.abs(y * 1000 + x) % channels.length
			//const itemIndex = Math.abs(y * Math.ceil(window.innerWidth / 320) + x) % channels.length
			const itemIndex = Math.abs(y * 10 + x) % channels.length
			const channel = channels[itemIndex]

			return {
				channel,
				coordinates: `(${x}, ${y})`
			}
		}
	})
	let visibleItems = $state(grid.generateVisibleItems())

	let mainEl
	let draggable

	const updateGrid = throttle(() => {
		visibleItems = grid.generateVisibleItems()
	}, 16)

	function updateViewport() {
		grid.updateViewport(window.innerWidth, window.innerHeight)
		updateGrid()
	}

	$effect(() => {
		if (!mainEl) return

		updateViewport()

		// Create draggable with inverted movement (drag moves viewport, not content)
		draggable = Draggable.create(mainEl, {
			type: 'x,y',
			inertia: true,
			dragResistance: 0.5,
			trigger: mainEl.parentElement,
			onDrag() {
				// Drag right = see content to the left (negative virtual position)
				grid.setPosition(-this.x, -this.y)
				updateGrid()
			},
			onThrowUpdate() {
				grid.setPosition(-this.x, -this.y)
				updateGrid()
			},
			onDragEnd() {
				updateGrid()
			},
			onThrowComplete() {
				updateGrid()
			}
		})[0]

		window.addEventListener('resize', updateViewport)

		return () => {
			if (draggable) draggable.kill()
			window.removeEventListener('resize', updateViewport)
		}
	})
</script>

<div class="infinite-container">
	<main bind:this={mainEl}>
		{#each visibleItems as item (item.id)}
			<article style="transform: translate({item.x}px, {item.y}px);">
				{#if item.content.channel}
					<!-- <ChannelHero channel={item.content.channel} /> -->
					<figure>
						<a href={resolve('/[slug]', {slug: item.content.channel.slug})}>
							<ChannelAvatar id={item.content.channel.image} alt={item.content.channel.name} size={64} />
						</a>
					</figure>
					<ButtonPlay channel={item.content.channel} />
					<h3>{item.content.channel.name}</h3>
					<small class="coordinates">{item.content.coordinates}</small>
				{/if}
			</article>
		{/each}
	</main>
</div>

<style>
	.infinite-container {
		position: fixed;
		top: 2.9rem;
		left: 0;
		right: 0;
		bottom: 0;
		overflow: hidden;
		background: var(--gray-1);
		cursor: grab;
	}

	.infinite-container:active {
		cursor: grabbing;
	}

	main {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}

	article {
		position: absolute;
		/* must match width/height in infinite-grid js */
		width: 320px;
		height: 320px;

		display: flex;
		justify-content: center;
		flex-flow: column;
		place-items: center;

		background: var(--gray-2);
		border-radius: var(--border-radius);
	}

	.coordinates {
		position: absolute;
		bottom: 0.3rem;
		right: 0.5rem;
	}

	figure {
		width: 5rem;
		margin-bottom: 1rem;
		:global(img) {
			width: 100%;
		}
	}

	h3 {
		font-size: var(--font-7);
		text-align: center;
		line-height: 1.2;
		margin: 1rem 0 0;
	}
</style>
