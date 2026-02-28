<script>
	import {scale} from 'svelte/transition'
	import {appState} from '$lib/app-state.svelte'
	import Deck from '$lib/components/deck.svelte'

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
					in:scale={{start: deckScaleStart, duration: deckTransitionMs}}
					out:scale={{start: deckScaleStart, duration: deckExitMs}}
				>
					<Deck {deckId} />
				</div>
			{/each}
		</section>
	{/if}
	{#if listeningDeckIds.length}
		<section class="broadcasts" aria-label="Broadcast listener decks">
			{#each listeningDeckIds as deckId (deckId)}
				<div
					class="deck-item"
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
		padding: 0.4rem;

		&:empty {
			display: none;
		}

		&.all-compact {
			height: 0;
			flex: 0 0 0;
			overflow: hidden;
		}
	}

	.local {
		display: flex;
		flex-direction: row;
		min-height: 0;
	}

	.deck-item {
		display: flex;
		min-height: 0;
		min-width: 0;
	}

	.broadcasts {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow-y: auto;
		flex: 1 1 24rem;
		min-width: min(36rem, 45vw);
	}

	.broadcasts :global(.deck.listening) {
		width: 100%;
		min-width: 0;
		flex: 1 1 auto;
	}

	@media (max-width: 768px) {
		.deck-strip {
			flex-direction: column;
			height: auto;
			flex-shrink: 1;
			overflow-y: auto;
		}

		.local {
			flex-direction: column;
		}

		.broadcasts {
			overflow-y: visible;
			flex: 1 1 auto;
			min-width: 0;
		}
	}
</style>
