<script>
	import gsap from 'gsap'
	import {Draggable} from 'gsap/Draggable'
	import {InertiaPlugin} from 'gsap/InertiaPlugin'
	import {useAppState} from '$lib/app-state.svelte'
	import {appStateCollection} from '$lib/collections'
	import Player from '$lib/components/player.svelte'

	const appState = $derived(useAppState().data)

	// This component wraps the player and controls the "expanded" state,
	// via a toggle button and a draggable element.

	gsap.registerPlugin(Draggable, InertiaPlugin)

	let enableDrag = $state(false)

	/** @type {HTMLElement} */
	let footerElement

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
				appStateCollection.update(1, (draft) => {
					draft.player_expanded = dragY < 0
				})
			}
		})
		return () => {
			draggable[0].kill()
		}
	})
</script>

<footer
	bind:this={footerElement}
	class={{
		expanded: appState?.player_expanded,
		showVideo: appState?.show_video_player
	}}
>
	<Player />
</footer>

<style>
	footer {
		background: var(--footer-bg);
		border: 1px solid var(--gray-7);
		border-radius: var(--border-radius);

		position: fixed;
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
