<script>
	import MixBuilder from '$lib/components/mix-builder.svelte'
	import DjDeck from '$lib/components/dj-deck.svelte'
	import DjCrossfader from '$lib/components/dj-crossfader.svelte'
	import {mix, mixAll} from '$lib/lab/mix'

	/** @type {import('$lib/components/mix-builder.svelte').Source[]} */
	let sources = $state([])
	let options = $state({shuffle: false, withoutErrors: false, limit: 50})

	/** @type {string[]} */
	let queueA = $state([])
	/** @type {string[]} */
	let queueB = $state([])

	/** @type {import('$lib/components/dj-deck.svelte').DeckState} */
	let deckA = $state({id: 'A', trackId: null, trackUrl: null, trackTitle: null, volume: 1, speed: 1, playing: false})
	/** @type {import('$lib/components/dj-deck.svelte').DeckState} */
	let deckB = $state({id: 'B', trackId: null, trackUrl: null, trackTitle: null, volume: 1, speed: 1, playing: false})

	// Equal-power crossfade: convert -1..1 to 0..1, then apply quarter-sine curve
	let crossfader = $state(0)
	let fade = $derived((crossfader + 1) / 2)
	let volumeA = $derived(Math.cos(fade * Math.PI * 0.5))
	let volumeB = $derived(Math.sin(fade * Math.PI * 0.5))

	/** @type {import('./$types').Snapshot<{sources: typeof sources, options: typeof options, queueA: string[], queueB: string[]}>} */
	export const snapshot = {
		capture: () => ({sources, options, queueA, queueB}),
		restore: (v) => {
			sources = v.sources
			options = v.options
			queueA = v.queueA
			queueB = v.queueB
		}
	}

	function buildTrackIds() {
		if (!sources.length) return []
		const channels = sources.filter((s) => s.type === 'channel')
		const tags = sources.filter((s) => s.type === 'tag')

		let m = channels.length > 0 ? mix() : mixAll()
		for (const {value} of channels) m = m.from(value)
		for (const {value} of tags) m = m.withTag(value)
		m = m.unique()
		if (options.withoutErrors) m = m.withoutErrors()
		if (options.shuffle) m = m.shuffle()

		return m.take(options.limit).ids()
	}

	/** @param {'A' | 'B'} deck */
	function loadToDeck(deck) {
		const ids = buildTrackIds()
		if (deck === 'A') queueA = ids
		else queueB = ids
	}

	let canLoad = $derived(sources.length > 0)
</script>

<svelte:head>
	<title>Mix</title>
</svelte:head>

<div class="mixer-layout">
	<!-- Source Device -->
	<section class="device source-device">
		<header class="caps">Source</header>
		<MixBuilder bind:sources bind:options />
		<footer class="outputs">
			<button class="output output-a" onclick={() => loadToDeck('A')} disabled={!canLoad}>
				<span class="pipe"></span>
				A
			</button>
			<button class="output output-b" onclick={() => loadToDeck('B')} disabled={!canLoad}>
				<span class="pipe"></span>
				B
			</button>
		</footer>
	</section>

	<!-- Pipes -->
	<div class="pipes">
		<div class="pipe pipe-a"></div>
		<div class="pipe pipe-b"></div>
	</div>

	<!-- Decks -->
	<div class="decks">
		<section class="device deck-device">
			<DjDeck bind:deck={deckA} effectiveVolume={volumeA} queue={queueA} />
		</section>
		<section class="device deck-device">
			<DjDeck bind:deck={deckB} effectiveVolume={volumeB} queue={queueB} />
		</section>
	</div>

	<!-- Mixer Device -->
	<section class="device mixer-device">
		<DjCrossfader bind:value={crossfader} />
	</section>
</div>

<style>
	.mixer-layout {
		padding: 16px;
		display: flex;
		flex-direction: column;
		max-width: 800px;
		margin: 0 auto;
	}

	.device {
		background: var(--gray-2);
		border: 2px solid var(--gray-4);
		border-radius: 6px;
	}

	/* Source device */
	.source-device {
		display: flex;
		flex-direction: column;
		padding: 12px;
		gap: 8px;
	}

	.source-device > header {
		color: var(--gray-9);
	}

	.outputs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		margin-top: 8px;
		padding-top: 12px;
		border-top: 1px solid var(--gray-4);
	}

	.output {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		background: var(--gray-3);
		border: 1px solid var(--gray-5);
		border-radius: 4px;
		padding: 8px 16px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.output:not(:disabled):hover {
		background: var(--gray-4);
	}

	.output:not(:disabled):active {
		background: var(--gray-5);
	}

	.output:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.output .pipe {
		width: 6px;
		height: 12px;
		background: var(--gray-5);
		border-radius: 1px;
	}

	.output:not(:disabled) .pipe {
		background: var(--accent-9);
	}

	/* Pipes connecting source to decks */
	.pipes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		height: 24px;
	}

	.pipes .pipe {
		width: 2px;
		height: 100%;
		background: var(--gray-4);
		justify-self: center;
	}

	/* Decks */
	.decks {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.deck-device {
		padding: 0;
		overflow: hidden;
	}

	/* Mixer/crossfader */
	.mixer-device {
		margin-top: 16px;
		padding: 12px 16px;
		max-width: 320px;
		align-self: center;
	}

	@media (max-width: 600px) {
		.mixer-layout {
			padding: 12px;
		}

		.outputs {
			gap: 8px;
		}

		.pipes {
			display: none;
		}

		.decks {
			grid-template-columns: 1fr;
			gap: 12px;
		}

		.mixer-device {
			max-width: none;
			margin-top: 12px;
		}
	}
</style>
