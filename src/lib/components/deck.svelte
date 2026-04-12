<script>
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import {captureEventsCollection} from '$lib/collections/capture-events'
	import Player from '$lib/components/player.svelte'
	import QueuePanel from '$lib/components/queue-panel.svelte'

	/** @type {{deckId: number}} */
	let {deckId} = $props()

	let deck = $derived(appState.decks[deckId])
	let showPlayer = $derived(page.url.searchParams.get('player') !== 'false')
	let isListeningToBroadcast = $derived(Boolean(deck?.listening_to_channel_id))
	let isBroadcasting = $derived(Boolean(deck?.broadcasting_channel_id))
	let isAutoRadio = $derived(Boolean(deck?.auto_radio))
	let firstListeningDeckId = $derived.by(() =>
		Object.keys(appState.decks)
			.map(Number)
			.sort((a, b) => a - b)
			.find((id) => Boolean(appState.decks[id]?.listening_to_channel_id))
	)

	// For deck 1: only show when there are tracks queued/playing or any history exists.
	// Read collection size directly to avoid spinning up one full live query per deck.
	let hasHistory = $derived(
		[...captureEventsCollection.state.values()].some((e) => e.event === 'player:track_play')
	)
	let hasContent = $derived(
		(deck?.playlist_tracks?.length ?? 0) > 0 || Boolean(deck?.playlist_track) || hasHistory
	)

	// Deck 1 hides when empty; additional decks are always visible
	let visible = $derived(showPlayer && deck && (deckId !== 1 || hasContent))

	let isActiveDeck = $derived(appState.active_deck_id === deckId)

	// Inline deck width from stored value
	let videoMixOpacity = $derived.by(() => {
		if (!deck?.video_mix || !isListeningToBroadcast) return undefined
		if (deck.muted) return 0
		const volume = Number.isFinite(deck.volume) ? deck.volume : 1
		return Math.max(0, Math.min(1, volume))
	})
	let videoMixZ = $derived(deckId === firstListeningDeckId ? 30 : deck?.is_playing ? 20 : 10)
	let deckStyle = $derived.by(() => {
		/** @type {string[]} */
		const styles = []
		if (deck?.queue_panel_width) styles.push(`--deck-width: ${deck.queue_panel_width}px`)
		if (deck?.video_mix && isListeningToBroadcast) {
			styles.push(`--video-mix-opacity: ${videoMixOpacity ?? 1}`)
			styles.push(`--video-mix-z: ${videoMixZ}`)
		}
		return styles.join('; ')
	})

	let scrollToActive = $state(/** @type {(() => void) | undefined} */ (undefined))

	// Resize handle state
	let resizing = $state(false)

	/** @param {PointerEvent} e */
	function onResizeStart(e) {
		if (e.button !== 0) return
		e.preventDefault()
		e.stopPropagation()

		const handle = /** @type {HTMLElement} */ (e.currentTarget)
		handle.setPointerCapture(e.pointerId)

		resizing = true
		const startX = e.clientX
		const startWidth = deck?.queue_panel_width ?? 400

		/** @param {PointerEvent} moveEvent */
		function onMove(moveEvent) {
			// Dragging left edge: moving left = wider, moving right = narrower
			const delta = startX - moveEvent.clientX
			const newWidth = Math.max(280, Math.min(800, startWidth + delta))
			if (deck) deck.queue_panel_width = newWidth
		}

		/** @param {PointerEvent} upEvent */
		function onUp(upEvent) {
			resizing = false
			handle.releasePointerCapture(upEvent.pointerId)
			handle.removeEventListener('pointermove', /** @type {any} */ (onMove))
			handle.removeEventListener('pointerup', /** @type {any} */ (onUp))
		}

		handle.addEventListener('pointermove', /** @type {any} */ (onMove))
		handle.addEventListener('pointerup', /** @type {any} */ (onUp))
	}
</script>

{#if visible}
	<section
		class={{
			deck: true,
			expanded: deck?.expanded,
			compact: deck?.compact,
			listening: isListeningToBroadcast,
			'video-mix': Boolean(deck?.video_mix && isListeningToBroadcast),
			broadcasting: isBroadcasting,
			auto: isAutoRadio,
			'active-deck': isActiveDeck,
			resizing,
			'hide-queue': deck?.hide_queue_panel,
			'hide-video': deck?.hide_video_player
		}}
		data-deck={deckId}
		style={deckStyle}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="resize-handle" onpointerdown={onResizeStart}></div>
		<div class="deck-body">
			<Player {deckId} {scrollToActive}>
				{#if !isListeningToBroadcast && !isAutoRadio}
					<QueuePanel {deckId} bind:scrollToActive />
				{/if}
			</Player>
		</div>
	</section>
{/if}

<style>
	.deck {
		display: flex;
		flex-direction: row;
		min-height: 0;
		min-width: 280px;
		width: var(--deck-width, 400px);
		flex-shrink: 0;
		background: var(--color-interface-elevated);
		border-radius: var(--border-radius);
		overflow: hidden;
		position: relative;
	}

	.deck:not(.expanded) {
		transition: border-color var(--deck-transition-fast) var(--deck-transition-ease);
	}

	.resize-handle {
		width: 3px;
		cursor: col-resize;
		border-right: 1px solid var(--gray-7);
		border-radius: var(--border-radius) 0 0 var(--border-radius);
		flex-shrink: 0;
		touch-action: none;
		transition: border-color 120ms ease;
	}

	.resize-handle:hover,
	.resize-handle:focus-visible,
	.deck.resizing .resize-handle {
		border-right-color: var(--deck-accent, var(--gray-5));
	}

	@media (max-width: 768px) {
		.deck {
			flex: 1;
			min-width: 0;
			width: 100%;
		}

		/* deck has at least one visible panel (video or queue): fill available height */
		.deck:not(.compact):not(.expanded):is(
				:not(.hide-video),
				.listening,
				.auto,
				:not(.listening):not(.auto):not(.hide-queue)
			) {
			height: 100%;
		}

		.deck:not(.compact):not(.expanded):is(
				:not(.hide-video),
				.listening,
				.auto,
				:not(.listening):not(.auto):not(.hide-queue)
			)
			:global(.video:not(:has(.native-audio-player))) {
			flex: 1 1 auto;
			min-height: 0;
			max-height: none;
			aspect-ratio: auto;
		}

		.deck:not(.compact):not(.expanded):is(
				:not(.hide-video),
				.listening,
				.auto,
				:not(.listening):not(.auto):not(.hide-queue)
			)
			:global(.queue-panel) {
			flex: 1 1 auto;
			min-height: 0;
		}

		.deck:not(.compact):not(.expanded):is(
				:not(.hide-video),
				.listening,
				.auto,
				:not(.listening):not(.auto):not(.hide-queue)
			)
			:global(.controls) {
			flex-wrap: wrap;
		}

		.resize-handle {
			display: none;
		}
	}

	.deck.expanded {
		flex: 1 1 0;
		width: 100%;
		min-width: 0;
		max-width: none;
		height: 100%;
		min-height: 0;
		border: 0;
		border-radius: 0;
	}

	.deck.expanded .resize-handle {
		display: none;
	}

	.deck.expanded:not(.hide-queue):not(.auto) :global(.video) {
		max-height: 25dvh;
	}

	.deck-body {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		min-width: 0;
	}

	/* Compact: collapse to zero width, stay in DOM for audio playback.
	   The DeckCompactBar at the bottom of the layout provides the compact UI. */
	.deck.compact {
		width: 0;
		min-width: 0;
		overflow: hidden;
		border: none;
		pointer-events: none;
	}

	@media (max-width: 768px) {
		.deck.compact {
			height: 0;
			min-height: 0;
		}
	}

	.deck :global(.bottom-chrome article.active) {
		border-radius: var(--border-radius) var(--border-radius) 0 0;
	}

	/* Hide queue panel via CSS — keeps it in the DOM */
	.deck.hide-queue :global(.queue-panel) {
		display: none;
	}

	/* When queue is hidden, let video fill available space but not overflow */
	.deck.hide-queue :global(.video) {
		max-height: none;
		flex: 1;
	}

	/* In expanded + hide-queue, constrain so controls/footer stay visible */
	.deck.expanded.hide-queue :global(.video) {
		max-height: calc(100dvh - 10rem);
	}

	/* Broadcast listener / auto-radio: no queue, so use less space */
	.deck.listening,
	.deck.auto {
		width: var(--deck-width, 280px);
		min-width: 200px;
		flex-shrink: 0;
	}

	/* Auto-radio: video fills available height (no queue competing for space) */
	.deck.auto :global(.video) {
		max-height: none;
		flex: 1;
	}

	/* Hide video via CSS — keeps media element in the DOM for audio playback */
	.deck.hide-video :global(media-controller.video) {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
		pointer-events: none;
	}

	/* When video is hidden but queue is visible, queue fills the space.
	   Auto/listening decks have no queue in the DOM — show the placeholder there. */
	.deck.hide-video:not(.hide-queue):not(.auto):not(.listening) :global(.video-hidden-placeholder) {
		display: none;
	}

	.deck.hide-video:not(.hide-queue) :global(.queue-panel) {
		flex: 1 1 auto;
		min-height: 0;
	}

	/* @media (prefers-reduced-motion: reduce) {
		.deck:not(.expanded) {
			transition: none;
		}
	} */
</style>
