<script>
	import {scale} from 'svelte/transition'
	import {appState, deckAccent} from '$lib/app-state.svelte'
	import Deck from '$lib/components/deck.svelte'
	import * as m from '$lib/paraglide/messages'

	let deckIds = $derived(
		Object.keys(appState.decks)
			.map(Number)
			.sort((a, b) => a - b)
	)
	let listeningDeckIds = $derived(deckIds.filter((id) => Boolean(appState.decks[id]?.listening_to_channel_id)))
	let localDeckIds = $derived(deckIds.filter((id) => !appState.decks[id]?.listening_to_channel_id))
	let allDecksCompact = $derived(deckIds.length > 0 && deckIds.every((id) => appState.decks[id]?.compact))
	const deckTransitionMs = 200
	const deckExitMs = 0
	const deckScaleStart = 0.95
</script>

<aside class="deck-strip" class:all-compact={allDecksCompact}>
	{#if localDeckIds.length}
		<section class="local">
			{#each localDeckIds as deckId (deckId)}
				<div
					class="deck-item"
					style:--deck-accent={deckAccent(deckIds, deckId)}
					in:scale={{start: deckScaleStart, duration: deckTransitionMs}}
					out:scale={{start: deckScaleStart, duration: deckExitMs}}
				>
					<Deck {deckId} />
				</div>
			{/each}
		</section>
	{/if}
	{#if listeningDeckIds.length}
		<section class="broadcasts" aria-label={m.decks_broadcast_listeners()}>
			{#each listeningDeckIds as deckId (deckId)}
				<div
					class="deck-item"
					style:--deck-accent={deckAccent(deckIds, deckId)}
					in:scale={{start: deckScaleStart, duration: deckTransitionMs}}
					out:scale={{start: deckScaleStart, duration: deckExitMs}}
				>
					<Deck {deckId} />
				</div>
			{/each}
		</section>
	{/if}
</aside>

<style>
	.deck-strip {
		display: flex;
		flex-direction: row;
		gap: 0.3rem;
		flex-shrink: 0;
		min-height: 0;
		height: 100%;
		overflow-x: auto;
		overflow-y: hidden;

		&:empty {
			display: none;
		}

		&.all-compact {
			height: 0;
			flex: 0 0 0;
			overflow: hidden;
		}
	}

	@media (min-width: 769px) {
		.deck-strip {
			width: fit-content;
			max-width: 72vw;
			min-width: 0;
			padding-inline: 0;
		}
	}

	.local {
		display: flex;
		flex-direction: row;
		flex: 0 0 auto;
		min-height: 0;
		min-width: max-content;
	}

	.deck-item {
		display: flex;
		flex: 0 0 auto;
		min-height: 0;
		min-width: 0;
	}

	.broadcasts {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow-y: auto;
		flex: 0 0 auto;
		min-width: min(36rem, 45vw);
	}

	.broadcasts :global(.deck.listening) {
		width: 100%;
		min-width: 0;
		flex: 1 1 auto;
	}

	/* hide close button when only one deck */
	.deck-strip:not(:has(.deck-item:nth-child(2))) :global(.close-deck) {
		display: none;
	}

	/* "fill deck": non-compact with at least one visible panel (video or queue) */
	@media (max-width: 768px) {
		.deck-strip {
			flex-direction: column;
			height: auto;
			overflow-y: auto;
		}

		.deck-strip:not(.all-compact) {
			flex: 0 1 auto;
			min-height: 0;
		}

		/* grow to fill available height when any deck has visible content */
		.deck-strip:not(.all-compact):has(
				:global(.deck:not(.compact):is(:not(.hide-video), :not(.listening):not(.hide-queue)))
			) {
			flex: 1 1 0;
			min-height: 100%;
		}

		.local {
			flex-direction: column;
			min-height: 0;
			min-width: 0;
		}

		.broadcasts {
			overflow-y: visible;
			flex-direction: column;
			min-width: 0;
		}

		/* sections with fill decks share the strip height */
		.local:has(:global(.deck:not(.compact):is(:not(.hide-video), :not(.listening):not(.hide-queue)))),
		.broadcasts:has(:global(.deck:not(.compact):is(:not(.hide-video), :not(.listening):not(.hide-queue)))) {
			flex: 1 1 0;
			min-height: 0;
		}

		/* deck-items: non-fill shrink but don't grow, fill items take available space */
		.deck-strip .deck-item {
			flex: 0 1 auto;
			min-height: 0;
		}

		.deck-strip .deck-item:has(:global(.deck:not(.compact):is(:not(.hide-video), :not(.listening):not(.hide-queue)))) {
			flex: 1 1 0;
		}
	}
</style>
