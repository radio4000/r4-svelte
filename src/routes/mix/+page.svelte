<script>
	import MixSource from '$lib/components/mix-source.svelte'
	import DjDeck from '$lib/components/dj-deck.svelte'
	import DjCrossfader from '$lib/components/dj-crossfader.svelte'
	import InputRange from '$lib/components/input-range.svelte'
	import {mix, mixAll} from '$lib/lab/mix'
	import {ensureTracksLoaded} from '$lib/tanstack/collections'

	/** @type {import('$lib/components/mix-source.svelte').Source[]} */
	let sources = $state([])
	let options = $state({shuffle: false, withoutErrors: false, limit: 50})
	let loading = $state(false)
	let loadVersion = 0

	$effect(() => {
		const slugs = sources.filter((s) => s.type === 'channel').map((s) => s.value)
		if (!slugs.length) return
		const version = ++loadVersion
		loading = true
		Promise.all(slugs.map(ensureTracksLoaded)).finally(() => {
			if (version === loadVersion) loading = false
		})
	})

	function buildMix() {
		const channelSources = sources.filter((s) => s.type === 'channel')
		const tagSources = sources.filter((s) => s.type === 'tag')

		let m = channelSources.length > 0 ? mix() : mixAll()

		for (const source of channelSources) {
			m = m.from(source.value)
		}

		for (const source of tagSources) {
			m = m.withTag(source.value)
		}

		m = m.unique()

		if (options.withoutErrors) m = m.withoutErrors()

		return m
	}

	let trackCount = $derived.by(() => {
		if (sources.length === 0) return 0
		return Math.min(buildMix().count(), options.limit)
	})

	function getTrackIds() {
		if (sources.length === 0) return /** @type {string[]} */ ([])
		let m = buildMix()
		if (options.shuffle) m = m.shuffle()
		return m.take(options.limit).ids()
	}

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

	/** @param {import('$lib/components/mix-source.svelte').Source} source */
	function handleAddSource(source) {
		sources = [...sources, source]
	}

	/** @param {import('$lib/components/mix-source.svelte').Source} source */
	function handleRemoveSource(source) {
		sources = sources.filter((s) => !(s.type === source.type && s.value === source.value))
	}

	/** @param {'A' | 'B'} deck */
	function loadToDeck(deck) {
		const ids = getTrackIds()
		if (deck === 'A') queueA = ids
		else queueB = ids
	}
</script>

<svelte:head>
	<title>Mix</title>
</svelte:head>

<div class="constrained mixer-layout">
	<!-- Source Device (Crate) -->
	<section class="device source-device">
		<header class="caps">Crate</header>
		<MixSource {sources} onadd={handleAddSource} onremove={handleRemoveSource} />
	</section>

	<!-- Pipe from crate to processor -->
	<div class="pipe-center"><div class="pipe"></div></div>

	<!-- Processor Device -->
	<section class="device processor-device">
		<button type="button" class:active={options.shuffle} onclick={() => (options.shuffle = !options.shuffle)}>
			Shuffle
		</button>
		<button
			type="button"
			class:active={options.withoutErrors}
			onclick={() => (options.withoutErrors = !options.withoutErrors)}
		>
			No errors
		</button>
		<label class="limit">
			<InputRange bind:value={options.limit} min={10} max={200} step={10} visualStep={20} />
		</label>
		<output>{loading ? '...' : trackCount} tracks</output>
	</section>

	<!-- Pipes from processor -->
	<div class="pipes pipes-from-source">
		<div class="pipe"></div>
		<div class="pipe"></div>
	</div>

	<!-- Load buttons -->
	<div class="outputs">
		<button class="output" onclick={() => loadToDeck('A')} disabled={!sources.length}>A</button>
		<button class="output" onclick={() => loadToDeck('B')} disabled={!sources.length}>B</button>
	</div>

	<!-- Pipes to decks -->
	<div class="pipes pipes-to-decks">
		<div class="pipe" data-active={deckA.playing || undefined}></div>
		<div class="pipe" data-active={deckB.playing || undefined}></div>
	</div>

	<!-- Decks -->
	<div class="decks">
		<section class="device deck-device" data-playing={deckA.playing || undefined}>
			<DjDeck bind:deck={deckA} effectiveVolume={volumeA} queue={queueA} />
		</section>
		<section class="device deck-device" data-playing={deckB.playing || undefined}>
			<DjDeck bind:deck={deckB} effectiveVolume={volumeB} queue={queueB} />
		</section>
	</div>

	<!-- Pipes to mixer -->
	<div class="pipes pipes-to-mixer">
		<div class="pipe"></div>
		<div class="pipe"></div>
	</div>

	<!-- Mixer Device -->
	<section class="device mixer-device">
		<DjCrossfader bind:value={crossfader} />
	</section>
</div>

<style>
	@keyframes signal-flow {
		0% {
			background-position: 0 0;
		}
		100% {
			background-position: 0 1rem;
		}
	}

	/* Custom hardware palette */
	.mixer-layout {
		--c-gray1: hsl(50 14% 96%);
		--c-gray2: hsl(50 14% 91%);
		--c-gray3: hsl(50 10% 76%);
		--c-gray4: hsl(50 10% 56%);
		--c-gray5: hsl(30 10% 36%);
		--c-gray6: hsl(30 10% 26%);
		--c-gray7: hsl(30 8% 16%);
		--c-gray8: hsl(30 8% 7%);
		--c-gray9: hsl(30 2% 4%);

		--c-red5: hsl(17 70% 55%);
		--c-green5: hsl(98 25% 55%);
		--c-blue5: hsl(221 35% 54%);
		--c-yellow5: hsl(41 79% 55%);

		display: flex;
		flex-direction: column;
	}

	.device {
		background: var(--c-gray7);
		border: 2px solid var(--c-gray6);
		border-radius: var(--border-radius);
	}

	/* Source device (crate) */
	.source-device {
		display: flex;
		flex-direction: column;
		padding: 0.75rem;
		gap: 0.5rem;
		background: linear-gradient(180deg, hsl(40 15% 18%) 0%, var(--c-gray7) 100%);
		border-color: hsl(40 20% 30%);
	}

	.source-device > header {
		color: var(--c-yellow5);
		letter-spacing: 0.05em;
	}

	/* Processor device */
	.processor-device {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		max-width: 32rem;
		align-self: center;
	}

	.processor-device button {
		font-size: var(--font-2);
		padding: 0.2rem 0.5rem;
	}

	.processor-device .limit {
		flex: 1;
		min-width: 6rem;
	}

	.processor-device output {
		font-size: var(--font-1);
		font-variant-numeric: tabular-nums;
		color: var(--c-gray3);
		white-space: nowrap;
	}

	/* Single centered pipe */
	.pipe-center {
		display: flex;
		justify-content: center;
		height: 1rem;
	}

	.pipe-center .pipe {
		width: 2px;
		height: 100%;
		background: var(--c-gray5);
	}

	/* Pipes */
	.pipes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		height: 1rem;
	}

	.pipes .pipe {
		width: 2px;
		height: 100%;
		justify-self: center;
	}

	.pipes .pipe:first-child {
		background: hsl(17 30% 40%);
	}

	.pipes .pipe:last-child {
		background: hsl(221 25% 40%);
	}

	/* Pipes from decks to mixer - inset from inner edges */
	.pipes-to-mixer .pipe:first-child {
		justify-self: end;
		margin-right: 1rem;
	}

	.pipes-to-mixer .pipe:last-child {
		justify-self: start;
		margin-left: 1rem;
	}

	/* Animated signal flow when decks are playing */
	.pipes-to-decks .pipe[data-active] {
		background: none;
		background-image: repeating-linear-gradient(
			180deg,
			transparent 0,
			transparent 0.2rem,
			currentColor 0.2rem,
			currentColor 0.5rem
		);
		background-size: 2px 1rem;
		animation: signal-flow 0.3s linear infinite;
	}

	.pipes-to-decks .pipe:first-child {
		color: hsl(17 70% 55%);
	}

	.pipes-to-decks .pipe:last-child {
		color: hsl(221 55% 60%);
	}

	/* Load buttons (cartridge style) */
	.outputs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.output {
		display: flex;
		align-items: center;
		justify-content: center;
		justify-self: center;
		background: var(--c-gray6);
		border: 2px solid var(--c-gray5);
		border-radius: var(--border-radius);
		padding: 0.5rem 1.5rem;
		font-size: var(--font-2);
		font-weight: 600;
		color: var(--c-gray2);
		cursor: pointer;
		box-shadow: 0 2px 0 var(--c-gray8);
	}

	.output:not(:disabled):hover {
		background: var(--c-gray5);
		border-color: var(--c-gray4);
	}

	.output:not(:disabled):active {
		background: var(--c-gray4);
		box-shadow: none;
		transform: translateY(2px);
	}

	.output:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		box-shadow: none;
	}

	.output:first-child {
		background: hsl(17 50% 35%);
		border-color: hsl(17 50% 45%);
	}

	.output:first-child:not(:disabled):hover {
		background: hsl(17 55% 45%);
		border-color: hsl(17 55% 55%);
	}

	.output:last-child {
		background: hsl(221 40% 35%);
		border-color: hsl(221 40% 45%);
	}

	.output:last-child:not(:disabled):hover {
		background: hsl(221 45% 45%);
		border-color: hsl(221 45% 55%);
	}

	.output:first-child:not(:disabled):hover {
		border-color: var(--c-red5);
	}

	.output:last-child:not(:disabled):hover {
		border-color: var(--c-blue5);
	}

	/* Decks */
	.decks {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.deck-device {
		padding: 0;
		overflow: hidden;
	}

	.deck-device:first-child {
		background: hsl(17 25% 22%);
		border-color: hsl(17 30% 35%);
		--deck-accent: var(--c-red5);
	}

	.deck-device:last-child {
		background: hsl(221 20% 22%);
		border-color: hsl(221 25% 35%);
		--deck-accent: var(--c-blue5);
	}

	.deck-device[data-playing] {
		border-color: var(--deck-accent);
	}

	/* Mixer/crossfader */
	.mixer-device {
		padding: 0.75rem 1rem;
		max-width: 20rem;
		align-self: center;
		background: linear-gradient(90deg, hsl(17 20% 18%) 0%, var(--c-gray7) 50%, hsl(221 15% 18%) 100%);
		border-color: var(--c-gray5);
	}

	@media (max-width: 600px) {
		.outputs {
			gap: 0.5rem;
		}

		.decks {
			grid-template-columns: 1fr;
			gap: 0.75rem;
		}

		.mixer-device {
			max-width: none;
		}
	}
</style>
