<script>
	import {onMount} from 'svelte'

	const {children, title = 'Panel'} = $props()

	/** @type {HTMLDivElement | null} */
	let panel = $state(null)
	let isMinimized = $state(false)
	let isDragging = $state(false)
	let position = $state({x: 50, y: 50})
	let dragOffset = $state({x: 0, y: 0})

	onMount(() => {
		// Default position for now, no persistence
	})

	function calculateBounds() {
		if (!panel) return {minX: 0, maxX: 0, minY: 0, maxY: 0}

		const visibleEdge = 100
		const visibleTop = 40

		return {
			minX: -panel.offsetWidth + visibleEdge,
			maxX: window.innerWidth - visibleEdge,
			minY: -panel.offsetHeight + visibleTop,
			maxY: window.innerHeight - visibleTop
		}
	}

	function startDrag(event) {
		if (event.target.closest('button')) return
		if (!panel) return

		isDragging = true
		const rect = panel.getBoundingClientRect()
		dragOffset = {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top
		}

		document.addEventListener('mousemove', handleDrag)
		document.addEventListener('mouseup', stopDrag)
		event.preventDefault()
	}

	function handleDrag(event) {
		if (!isDragging || !panel) return

		const bounds = calculateBounds()
		let newX = event.clientX - dragOffset.x
		let newY = event.clientY - dragOffset.y

		newX = Math.max(bounds.minX, Math.min(bounds.maxX, newX))
		newY = Math.max(bounds.minY, Math.min(bounds.maxY, newY))

		position = {x: newX, y: newY}
	}

	function stopDrag() {
		isDragging = false
		document.removeEventListener('mousemove', handleDrag)
		document.removeEventListener('mouseup', stopDrag)
		savePosition()
	}

	function savePosition() {
		// No persistence for now
	}

	function toggleMinimize() {
		isMinimized = !isMinimized
	}

	$effect(() => {
		function handleResize() {
			if (!panel) return
			const bounds = calculateBounds()
			position = {
				x: Math.max(bounds.minX, Math.min(bounds.maxX, position.x)),
				y: Math.max(bounds.minY, Math.min(bounds.maxY, position.y))
			}
		}

		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	})
</script>

<div
	bind:this={panel}
	class="panel"
	class:minimized={isMinimized}
	class:dragging={isDragging}
	style="transform: translate({position.x}px, {position.y}px)"
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<header onmousedown={startDrag} ondblclick={toggleMinimize}>
		<h3>{title}</h3>
		<button onclick={toggleMinimize} type="button">
			{isMinimized ? '□' : '_'}
		</button>
	</header>

	{#if !isMinimized}
		<div class="panel-content">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.panel {
		position: fixed;
		background: var(--gray-1);
		color: var(--gray-12);
		border: 1px solid var(--gray-8);
		border-radius: var(--border-radius);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 1000;
		min-width: 300px;
		max-width: 90vw;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
	}

	.panel.dragging {
		user-select: none;
		cursor: grabbing;
	}

	.panel.minimized {
		height: auto;
	}

	header {
		border-radius: var(--border-radius);
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
		padding: 0.5rem;
		background: var(--gray-3);
		cursor: grab;
		display: flex;
		justify-content: space-between;
		align-items: center;
		user-select: none;
	}

	header:active {
		cursor: grabbing;
	}

	.panel-content {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
</style>
