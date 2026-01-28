<script>
	import MixCrate from '$lib/components/mix-crate.svelte'
	import MixDeck from '$lib/components/mix-deck.svelte'
	import MixCrossfader from '$lib/components/mix-crossfader.svelte'
	import InputRange from '$lib/components/input-range.svelte'
	import {mix, mixAll} from '$lib/lab/mix'
	import {ensureTracksLoaded} from '$lib/tanstack/collections'

	/** @type {import('$lib/components/mix-crate.svelte').Source[]} */
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

	let baseMix = $derived.by(() => {
		if (!sources.length) return null
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
	})

	let trackCount = $derived(baseMix ? Math.min(baseMix.count(), options.limit) : 0)

	function getTrackIds() {
		if (!baseMix) return /** @type {string[]} */ ([])
		let m = baseMix.clone()
		if (options.shuffle) m = m.shuffle()
		return m.take(options.limit).ids()
	}

	/** @type {string[]} */
	let queueA = $state([])
	/** @type {string[]} */
	let queueB = $state([])

	/** @type {import('$lib/components/mix-deck.svelte').DeckState} */
	let deckA = $state({id: 'A', trackId: null, trackUrl: null, trackTitle: null, volume: 1, speed: 1, playing: false})
	/** @type {import('$lib/components/mix-deck.svelte').DeckState} */
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

	/** @param {import('$lib/components/mix-crate.svelte').Source} source */
	function handleAddSource(source) {
		sources = [...sources, source]
	}

	/** @param {import('$lib/components/mix-crate.svelte').Source} source */
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
	<!-- Crate -->
	<section class="device crate">
		<header class="caps">Crate</header>
		<MixCrate {sources} {loading} onadd={handleAddSource} onremove={handleRemoveSource} />
	</section>

	<!-- Pipe: crate → processor -->
	<div class="pipe-center"><div class="pipe" data-loading={loading || undefined}></div></div>

	<!-- Processor -->
	<section class="device processor">
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

	<!-- Pipe: processor → loaders -->
	<div class="pipes pipes-to-loaders">
		<div class="pipe" data-loading={loading || undefined}></div>
		<div class="pipe" data-loading={loading || undefined}></div>
	</div>

	<!-- Loaders -->
	<div class="loaders">
		<button class="loader" onclick={() => loadToDeck('A')} disabled={!sources.length}>Load A</button>
		<button class="loader" onclick={() => loadToDeck('B')} disabled={!sources.length}>Load B</button>
	</div>

	<!-- Pipe: loaders → decks -->
	<div class="pipes pipes-to-decks">
		<div class="pipe" data-active={deckA.playing || undefined}></div>
		<div class="pipe" data-active={deckB.playing || undefined}></div>
	</div>

	<!-- Decks -->
	<div class="decks">
		<section class="device deck" data-playing={deckA.playing || undefined}>
			<MixDeck bind:deck={deckA} effectiveVolume={volumeA} queue={queueA} />
		</section>
		<section class="device deck" data-playing={deckB.playing || undefined}>
			<MixDeck bind:deck={deckB} effectiveVolume={volumeB} queue={queueB} />
		</section>
	</div>

	<!-- Pipe: decks → crossfader -->
	<div class="pipes pipes-to-crossfader">
		<div class="pipe"></div>
		<div class="pipe"></div>
	</div>

	<!-- Crossfader -->
	<section class="device crossfader">
		<MixCrossfader bind:value={crossfader} />
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

	/* Crate */
	.crate {
		display: flex;
		flex-direction: column;
		padding: 0.75rem;
		gap: 0.5rem;
		background: linear-gradient(180deg, hsl(40 15% 18%) 0%, var(--c-gray7) 100%);
		border-color: hsl(40 20% 30%);
	}

	.crate > header {
		color: var(--c-yellow5);
		letter-spacing: 0.05em;
	}

	/* Processor */
	.processor {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		max-width: 32rem;
		align-self: center;
	}

	.processor button {
		font-size: var(--font-2);
		padding: 0.2rem 0.5rem;
	}

	.processor .limit {
		flex: 1;
		min-width: 6rem;
	}

	.processor output {
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

	.pipe-center .pipe[data-loading] {
		background: none;
		background-image: repeating-linear-gradient(
			180deg,
			transparent 0,
			transparent 0.2rem,
			var(--c-yellow5) 0.2rem,
			var(--c-yellow5) 0.5rem
		);
		background-size: 2px 1rem;
		animation: signal-flow 0.5s linear infinite;
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

	.pipes-to-loaders .pipe[data-loading] {
		background: none;
		background-image: repeating-linear-gradient(
			180deg,
			transparent 0,
			transparent 0.2rem,
			var(--c-yellow5) 0.2rem,
			var(--c-yellow5) 0.5rem
		);
		background-size: 2px 1rem;
		animation: signal-flow 0.5s linear infinite;
	}

	/* Pipes: decks → crossfader - inset from inner edges */
	.pipes-to-crossfader .pipe:first-child {
		justify-self: end;
		margin-right: 1rem;
	}

	.pipes-to-crossfader .pipe:last-child {
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

	/* Loaders */
	.loaders {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.loader {
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

	.loader:not(:disabled):hover {
		background: var(--c-gray5);
		border-color: var(--c-gray4);
	}

	.loader:not(:disabled):active {
		background: var(--c-gray4);
		box-shadow: none;
		transform: translateY(2px);
	}

	.loader:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		box-shadow: none;
	}

	.loader:first-child {
		background: hsl(17 50% 35%);
		border-color: hsl(17 50% 45%);
	}

	.loader:first-child:not(:disabled):hover {
		background: hsl(17 55% 45%);
		border-color: hsl(17 55% 55%);
	}

	.loader:last-child {
		background: hsl(221 40% 35%);
		border-color: hsl(221 40% 45%);
	}

	.loader:last-child:not(:disabled):hover {
		background: hsl(221 45% 45%);
		border-color: hsl(221 45% 55%);
	}

	.loader:first-child:not(:disabled):hover {
		border-color: var(--c-red5);
	}

	.loader:last-child:not(:disabled):hover {
		border-color: var(--c-blue5);
	}

	/* Decks */
	.decks {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.deck {
		padding: 0;
		overflow: hidden;
	}

	.deck:first-child {
		background: hsl(17 25% 22%);
		border-color: hsl(17 30% 35%);
		--deck-accent: var(--c-red5);
	}

	.deck:last-child {
		background: hsl(221 20% 22%);
		border-color: hsl(221 25% 35%);
		--deck-accent: var(--c-blue5);
	}

	.deck[data-playing] {
		border-color: var(--deck-accent);
	}

	/* Crossfader */
	.crossfader {
		padding: 0.75rem 1rem;
		max-width: 20rem;
		align-self: center;
		background: linear-gradient(90deg, hsl(17 20% 18%) 0%, var(--c-gray7) 50%, hsl(221 15% 18%) 100%);
		border-color: var(--c-gray5);
	}

	@media (max-width: 600px) {
		.loaders {
			gap: 0.5rem;
		}

		.decks {
			grid-template-columns: 1fr;
			gap: 0.75rem;
		}

		.crossfader {
			max-width: none;
		}
	}
</style>
