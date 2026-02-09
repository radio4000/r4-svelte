<script>
	import {appState} from '$lib/app-state.svelte'
	import Deck from '$lib/components/deck.svelte'

	let deckIds = $derived(Object.keys(appState.decks).map(Number))
</script>

<aside class="deck-strip">
	{#each deckIds as deckId, i (deckId)}
		<Deck {deckId} deckNumber={i + 1} deckCount={deckIds.length} />
	{/each}
</aside>

<style>
	.deck-strip {
		display: flex;
		flex-direction: row;
		flex-shrink: 0;
		min-height: 0;
		height: 100%;
	}

	.deck-strip:empty {
		display: none;
	}

	@media (max-width: 768px) {
		.deck-strip {
			flex-direction: column;
			width: 100%;
			height: auto;
		}
	}
</style>
