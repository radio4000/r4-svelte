<script lang="ts">
	import type {Source} from '$lib/components/mix-crate.svelte'
	import type {DeckState} from '$lib/components/mix-deck.svelte'
	import MixCrate from '$lib/components/mix-crate.svelte'
	import MixDeck from '$lib/components/mix-deck.svelte'
	import MixCrossfader from '$lib/components/mix-crossfader.svelte'
	import InputRange from '$lib/components/input-range.svelte'
	import {mix, mixAll} from '$lib/lab/mix'
	import {ensureTracksLoaded} from '$lib/tanstack/collections'

	const MAX_DECKS = 8

	const DECK_COLORS = [
		{bg: 'hsl(17 25% 22%)', border: 'hsl(17 30% 35%)', accent: 'hsl(17 70% 55%)'},
		{bg: 'hsl(221 20% 22%)', border: 'hsl(221 25% 35%)', accent: 'hsl(221 35% 54%)'},
		{bg: 'hsl(150 20% 20%)', border: 'hsl(150 25% 32%)', accent: 'hsl(150 50% 50%)'},
		{bg: 'hsl(280 20% 22%)', border: 'hsl(280 25% 35%)', accent: 'hsl(280 40% 55%)'},
		{bg: 'hsl(35 25% 22%)', border: 'hsl(35 30% 35%)', accent: 'hsl(35 70% 55%)'},
		{bg: 'hsl(190 20% 20%)', border: 'hsl(190 25% 32%)', accent: 'hsl(190 50% 50%)'}
	]

	function deckLabel(index: number) {
		return String.fromCharCode(65 + index)
	}

	function deckColor(index: number) {
		return DECK_COLORS[index % DECK_COLORS.length]
	}

	let sources: Source[] = $state([])
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

	function getTrackIds(): string[] {
		if (!baseMix) return []
		let m = baseMix.clone()
		if (options.shuffle) m = m.shuffle()
		return m.take(options.limit).ids()
	}

	// -- Decks state --

	let nextDeckId = 0

	function createDeck(): DeckState {
		return {id: nextDeckId++, trackId: null, trackUrl: null, trackTitle: null, volume: 1, speed: 1, playing: false}
	}

	let decks: DeckState[] = $state([createDeck(), createDeck()])
	let queues: Record<number, string[]> = $state({})

	function addDeck() {
		if (decks.length >= MAX_DECKS) return
		const deck = createDeck()
		decks = [...decks, deck]
	}

	function removeDeck(deckId: number) {
		if (decks.length <= 1) return
		decks = decks.filter((d) => d.id !== deckId)
		delete queues[deckId]
	}

	// Equal-power crossfade (only used for 2-deck mode)
	let crossfader = $state(0)
	let fade = $derived((crossfader + 1) / 2)
	let crossfadeA = $derived(Math.cos(fade * Math.PI * 0.5))
	let crossfadeB = $derived(Math.sin(fade * Math.PI * 0.5))
	let showCrossfader = $derived(decks.length === 2)

	function effectiveVolume(index: number) {
		if (decks.length === 2) return index === 0 ? crossfadeA : crossfadeB
		return 1
	}

	function loadToDeck(deckId: number) {
		const ids = getTrackIds()
		queues = {...queues, [deckId]: ids}
	}
</script>

<svelte:head>
	<title>Mix</title>
</svelte:head>

<div class="mixer-layout">
	<!-- Crate -->
	<section class="device crate">
		<header class="caps">Crate</header>
		<MixCrate
			{sources}
			{loading}
			onadd={(s) => (sources = [...sources, s])}
			onremove={(s) => (sources = sources.filter((x) => !(x.type === s.type && x.value === s.value)))}
		/>
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
		{#if decks.length < MAX_DECKS}
			<button class="loader-add" type="button" onclick={addDeck}>+ Deck</button>
		{/if}
	</section>

	<!-- Decks -->
	<div class="decks">
		{#each decks as deck, i (deck.id)}
			<section
				class="device deck"
				data-playing={deck.playing || undefined}
				style:background={deckColor(i).bg}
				style:border-color={deck.playing ? deckColor(i).accent : deckColor(i).border}
				style:--deck-accent={deckColor(i).accent}
			>
				<button
					class="deck-load"
					onclick={() => loadToDeck(deck.id)}
					disabled={!sources.length}
					style:background={deckColor(i).border}>Load {deckLabel(i)}</button
				>
				{#if decks.length > 1}
					<button class="deck-remove" onclick={() => removeDeck(deck.id)}>&times;</button>
				{/if}
				<MixDeck bind:deck={decks[i]} effectiveVolume={effectiveVolume(i)} queue={queues[deck.id] ?? []} />
			</section>
		{/each}
	</div>

	<!-- Crossfader (2-deck mode only) -->
	{#if showCrossfader}
		<div class="pipes pipes-to-crossfader" style:grid-template-columns="1fr 1fr">
			<div class="pipe"></div>
			<div class="pipe"></div>
		</div>

		<section class="device crossfader">
			<MixCrossfader bind:value={crossfader} />
		</section>
	{/if}
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
		padding-inline: 0.5rem;
		margin-block: 0.5rem;
	}

	.device {
		background: var(--c-gray7);
		border: 2px solid var(--c-gray6);
		border-radius: var(--border-radius);
	}

	.crate {
		display: flex;
		flex-direction: column;
		padding: 0.75rem;
		gap: 0.5rem;
		background: linear-gradient(180deg, hsl(40 15% 18%) 0%, var(--c-gray7) 100%);
		border-color: hsl(40 20% 30%);

		& > header {
			color: var(--c-yellow5);
			letter-spacing: 0.05em;
		}
	}

	.processor {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		max-width: 32rem;
		align-self: center;
		margin-block-end: 1rem;

		& button {
			font-size: var(--font-2);
			padding: 0.2rem 0.5rem;
		}

		& .limit {
			flex: 1;
			min-width: 6rem;
		}

		& output {
			font-size: var(--font-1);
			font-variant-numeric: tabular-nums;
			color: var(--c-gray3);
			white-space: nowrap;
		}
	}

	.pipe-center {
		display: flex;
		justify-content: center;
		height: 1rem;

		& .pipe {
			width: 2px;
			height: 100%;
			background: var(--c-gray5);

			&[data-loading] {
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
		}
	}

	.pipes-to-crossfader {
		display: grid;
		height: 1rem;

		& .pipe {
			width: 2px;
			height: 100%;
			justify-self: center;
		}

		& .pipe:first-child {
			justify-self: end;
			margin-right: 1rem;
			background: hsl(17 30% 40%);
		}

		& .pipe:last-child {
			justify-self: start;
			margin-left: 1rem;
			background: hsl(221 25% 40%);
		}
	}

	.loader-add {
		font-size: var(--font-2);
		padding: 0.2rem 0.5rem;
		background: var(--c-gray6);
		border-color: var(--c-gray5);
		border-style: dashed;
	}

	.decks {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 320px));
		justify-content: center;
		gap: 1rem;
	}

	.deck {
		padding: 0;
		position: relative;
	}

	.deck-load {
		position: absolute;
		top: -6px;
		left: -6px;
		z-index: 1;
		font-size: var(--font-2);
		color: var(--c-gray2);
		transform: rotate(-3deg);

		&:not(:disabled):hover {
			filter: brightness(1.4);
		}

		&:not(:disabled):active {
			filter: brightness(1.6);
			transform: rotate(-3deg) translateY(1px);
		}
	}

	.deck-remove {
		position: absolute;
		top: 4px;
		right: 4px;
		z-index: 1;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.5);
		border: 1px solid var(--c-gray5);
		border-radius: var(--border-radius);
		color: var(--c-gray3);
		font-size: 16px;
		line-height: 1;
	}

	.crossfader {
		padding: 0.75rem 1rem;
		max-width: 20rem;
		align-self: center;
		background: linear-gradient(90deg, hsl(17 20% 18%) 0%, var(--c-gray7) 50%, hsl(221 15% 18%) 100%);
		border-color: var(--c-gray5);
	}

	@media (max-width: 640px) {
		.crossfader {
			max-width: none;
		}
	}
</style>
