<script>
	import DjDeck from './dj-deck.svelte'
	import InputRange from './input-range.svelte'

	/**
	 * @typedef {{
	 *   id: 'A' | 'B',
	 *   trackId: string | null,
	 *   trackUrl: string | null,
	 *   trackTitle: string | null,
	 *   volume: number,
	 *   speed: number,
	 *   playing: boolean
	 * }} DeckState
	 */

	/** @type {DeckState} */
	let deckA = $state({
		id: 'A',
		trackId: null,
		trackUrl: null,
		trackTitle: null,
		volume: 1,
		speed: 1,
		playing: false
	})

	/** @type {DeckState} */
	let deckB = $state({
		id: 'B',
		trackId: null,
		trackUrl: null,
		trackTitle: null,
		volume: 1,
		speed: 1,
		playing: false
	})

	let crossfader = $state(0)

	let volumeA = $derived(Math.cos(((crossfader + 1) / 2) * Math.PI * 0.5))
	let volumeB = $derived(Math.sin(((crossfader + 1) / 2) * Math.PI * 0.5))
</script>

<section class="mixer">
	<div class="decks">
		<DjDeck bind:deck={deckA} effectiveVolume={volumeA} />
		<DjDeck bind:deck={deckB} effectiveVolume={volumeB} />
	</div>

	<div class="crossfader">
		<span>A</span>
		<InputRange bind:value={crossfader} min={-1} max={1} step={0.1} />
		<span>B</span>
	</div>
</section>

<style>
	.mixer {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.decks {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.crossfader {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		background: var(--gray-2);
		border-radius: 4px;
	}

	.crossfader span {
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--gray-10);
	}

	@media (max-width: 600px) {
		.decks {
			grid-template-columns: 1fr;
		}
	}
</style>
