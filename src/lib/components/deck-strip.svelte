<script>
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
</script>

<aside class="deck-strip" class:all-compact={allDecksCompact}>
	<div class="deck-strip-main">
		{#each localDeckIds as deckId, i (deckId)}
			<Deck {deckId} deckNumber={i + 1} deckCount={deckIds.length} />
		{/each}
	</div>
	{#if listeningDeckIds.length}
		<div class="deck-strip-broadcasts" aria-label="Broadcast listener decks">
			{#each listeningDeckIds as deckId, i (deckId)}
				<Deck {deckId} deckNumber={i + 1} deckCount={deckIds.length} />
			{/each}
		</div>
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
	}

	.deck-strip-main {
		display: flex;
		flex-direction: row;
		min-height: 0;
	}

	.deck-strip-broadcasts {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow-y: auto;
	}

	.deck-strip:empty {
		display: none;
	}

	.deck-strip.all-compact {
		height: 0;
		flex: 0 0 0;
		overflow: hidden;
	}

	@media (max-width: 768px) {
		.deck-strip {
			flex-direction: column;
		}

		.deck-strip-main {
			flex-direction: column;
		}

		.deck-strip-broadcasts {
			overflow-y: visible;
		}
	}
</style>
