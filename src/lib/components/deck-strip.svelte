<script>
	import {appState} from '$lib/app-state.svelte'
	import Deck from '$lib/components/deck.svelte'

	let deckIds = $derived(Object.keys(appState.decks).map(Number))
	let allDecksCompact = $derived(deckIds.length > 0 && deckIds.every((id) => appState.decks[id]?.compact))
</script>

<aside class="deck-strip" class:all-compact={allDecksCompact}>
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

	.deck-strip.all-compact {
		height: 0;
		flex: 0 0 0;
		overflow: hidden;
	}
</style>
