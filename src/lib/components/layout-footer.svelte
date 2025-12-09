<script>
	import {page} from '$app/state'
	import gsap from 'gsap'
	import {Draggable} from 'gsap/Draggable'
	import {InertiaPlugin} from 'gsap/InertiaPlugin'
	import {appState} from '$lib/app-state.svelte'
	import Player from '$lib/components/player.svelte'

	let showPlayer = $derived(page.url.searchParams.get('player') !== 'false')

	// This component wraps the player and controls the "expanded" state,
	// via a toggle button and a draggable element.

	gsap.registerPlugin(Draggable, InertiaPlugin)

	let enableDrag = $state(false)

	let footerElement = $state(/** @type {HTMLElement | null} */ (null))

	// Setup GSAP swipe gestures
	$effect(() => {
		if (!enableDrag || !footerElement || typeof window === 'undefined') return
		const draggable = Draggable.create(footerElement, {
			type: 'y',
			inertia: true,
			// trigger: footerElement,
			allowContextMenu: true, // allow long-presses, necessary for volume slider
			dragClickables: false, // disable dragging on clickable elements
			allowNativeTouchScrolling: false,
			bounds: {minY: -5, maxY: 5},
			// snap: {y: 0},
			onDragEnd: function () {
				// const velocity = InertiaPlugin.getVelocity(this.target, 'y')
				const dragY = this.y
				appState.player_expanded = dragY < 0
			}
		})
		return () => {
			draggable[0].kill()
		}
	})
</script>

{#if showPlayer}
	<footer
		bind:this={footerElement}
		class={{
			expanded: appState.player_expanded,
			showVideo: appState.show_video_player
		}}
	>
		<Player />
	</footer>
{/if}

<style>
	footer {
		background: var(--footer-bg);
		border: 1px solid var(--gray-7);
		border-radius: var(--border-radius);

		position: absolute;
		left: 0.2rem;
		right: 0.2rem;
		bottom: 0.2rem;
		z-index: 10;
		/* transition: all 300ms ease-in-out; */

		&.expanded {
			height: 100dvh;
			left: 0;
			right: 0;
			bottom: 0;
			border: 0;
		}
	}
</style>
