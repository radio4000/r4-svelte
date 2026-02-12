<script>
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import {playHistoryCollection} from '$lib/tanstack/collections'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import Player from '$lib/components/player.svelte'
	import QueuePanel from '$lib/components/queue-panel.svelte'

	/** @type {{deckId: number, deckNumber?: number, deckCount?: number}} */
	let {deckId, deckNumber = 1, deckCount = 1} = $props()

	let deck = $derived(appState.decks[deckId])
	let showPlayer = $derived(page.url.searchParams.get('player') !== 'false')
	let isListeningToBroadcast = $derived(Boolean(deck?.listening_to_channel_id))

	// For deck 1: only show when there are tracks queued or a track playing
	const historyQuery = useLiveQuery((q) =>
		q.from({history: playHistoryCollection}).orderBy(({history}) => history.started_at, 'desc')
	)
	let hasContent = $derived(
		(deck?.playlist_tracks?.length ?? 0) > 0 || Boolean(deck?.playlist_track) || (historyQuery.data?.length ?? 0) > 0
	)

	// Deck 1 hides when empty; additional decks are always visible
	let visible = $derived(showPlayer && deck && (deckId !== 1 || hasContent))

	let isActiveDeck = $derived(appState.active_deck_id === deckId)

	// Inline deck width from stored value
	let deckStyle = $derived(deck?.queue_panel_width ? `--deck-width: ${deck.queue_panel_width}px` : '')

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
		class="deck"
		class:expanded={deck?.expanded}
		class:compact={deck?.compact}
		class:listening={isListeningToBroadcast}
		class:active-deck={isActiveDeck}
		class:resizing
		class:hide-queue={!deck?.queue_panel_visible}
		class:hide-video={!deck?.show_video_player}
		data-deck={deckId}
		style={deckStyle}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="resize-handle" onpointerdown={onResizeStart}></div>
		<div class="deck-body">
			<Player {deckId} {deckNumber} {deckCount}>
				{#if !isListeningToBroadcast}
					<QueuePanel {deckId} />
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
		background: var(--footer-bg);
		position: relative;
	}

	.resize-handle {
		width: 5px;
		cursor: col-resize;
		background: var(--gray-7);
		flex-shrink: 0;
		touch-action: none;
	}

	.resize-handle:hover,
	.deck.resizing .resize-handle {
		background: var(--accent, var(--gray-5));
	}

	@media (max-width: 768px) {
		.deck {
			min-width: 0;
			width: 100%;
		}

		.resize-handle {
			display: none;
		}
	}

	.deck.expanded {
		position: fixed;
		inset: 0;
		width: 100%;
		min-width: 0;
		border: 0;
		z-index: 200;
		background: var(--footer-bg);
	}

	.deck.expanded .resize-handle {
		display: none;
	}

	.deck.expanded:not(.hide-queue) :global(.video) {
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

	/* Broadcast listener: no queue, so use less space */
	.deck.listening {
		width: 280px;
		min-width: 200px;
		flex-shrink: 1;
	}

	/* Hide video via CSS — keeps media element in the DOM for audio playback */
	.deck.hide-video :global(.video) {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
		pointer-events: none;
	}
</style>
