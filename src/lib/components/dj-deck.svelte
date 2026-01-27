<script>
	import '$lib/youtube-video-custom-element.js'
	import {searchTracks} from '$lib/search'
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

	/** @type {{deck: DeckState, effectiveVolume?: number}} */
	let {deck = $bindable(), effectiveVolume = 1} = $props()

	/** @type {HTMLElement & {play: () => void, pause: () => void, volume: number, playbackRate: number} | null} */
	let player = $state(null)

	let searchQuery = $state('')
	/** @type {Array<{id: string, title: string, url: string}>} */
	let searchResults = $state([])
	let showResults = $state(false)

	$effect(() => {
		if (!player) return
		player.volume = deck.volume * effectiveVolume
	})

	$effect(() => {
		if (!player) return
		player.playbackRate = deck.speed
	})

	async function handleSearch() {
		if (!searchQuery.trim()) {
			searchResults = []
			return
		}
		const results = await searchTracks(searchQuery, {limit: 8})
		searchResults = results
			.filter((t) => t.url?.includes('youtube'))
			.map((t) => ({id: t.id, title: t.title || t.url || t.id, url: t.url || ''}))
		showResults = true
	}

	/** @param {{id: string, title: string, url: string}} track */
	function loadTrack(track) {
		deck.trackId = track.id
		deck.trackUrl = track.url
		deck.trackTitle = track.title
		deck.playing = false
		searchQuery = ''
		searchResults = []
		showResults = false
	}

	function togglePlay() {
		if (!player || !deck.trackUrl) return
		if (deck.playing) {
			player.pause()
		} else {
			player.play()
		}
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === 'Enter') {
			e.preventDefault()
			handleSearch()
		}
	}

	function closeResults() {
		showResults = false
	}
</script>

<article data-deck={deck.id}>
	<header>Deck {deck.id}</header>

	<div class="search">
		<input
			type="search"
			placeholder="Search tracks..."
			bind:value={searchQuery}
			onkeydown={handleKeydown}
			onfocus={() => searchResults.length && (showResults = true)}
			onblur={closeResults}
		/>
		{#if showResults && searchResults.length > 0}
			<menu onmousedown={(e) => e.preventDefault()}>
				{#each searchResults as track (track.id)}
					<li>
						<button type="button" onclick={() => loadTrack(track)}>
							{track.title}
						</button>
					</li>
				{/each}
			</menu>
		{/if}
	</div>

	<div class="player-wrap">
		{#if deck.trackUrl}
			<youtube-video
				bind:this={player}
				src={deck.trackUrl}
				onplay={() => (deck.playing = true)}
				onpause={() => (deck.playing = false)}
				onended={() => (deck.playing = false)}
			></youtube-video>
		{:else}
			<div class="empty">No track loaded</div>
		{/if}
	</div>

	<p class="track-title">{deck.trackTitle || '—'}</p>

	<div class="controls">
		<button type="button" onclick={togglePlay} disabled={!deck.trackUrl} class="play-btn">
			{deck.playing ? '⏸' : '▶'}
		</button>

		<label class="control-row">
			<span>Vol</span>
			<InputRange bind:value={deck.volume} min={0} max={1} step={0.05} />
		</label>

		<label class="control-row">
			<span>Speed</span>
			<InputRange bind:value={deck.speed} min={0.25} max={2} step={0.25} />
			<output>{deck.speed}x</output>
		</label>
	</div>
</article>

<style>
	article {
		border: 1px solid var(--gray-6);
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	header {
		font-weight: 600;
		text-transform: uppercase;
		font-size: 0.75rem;
		color: var(--gray-10);
	}

	.search {
		position: relative;
	}

	.search input {
		width: 100%;
	}

	.search menu {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		background: var(--gray-1);
		border: 1px solid var(--gray-6);
		z-index: 10;
		max-height: 200px;
		overflow-y: auto;
	}

	.search menu button {
		width: 100%;
		text-align: left;
		border: none;
		background: none;
		box-shadow: none;
		font-size: 0.875rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.search menu button:hover {
		background: var(--gray-3);
	}

	.player-wrap {
		aspect-ratio: 16/9;
		background: var(--gray-2);
	}

	.player-wrap :global(youtube-video) {
		width: 100%;
		height: 100%;
	}

	.empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--gray-8);
		font-size: 0.875rem;
	}

	.track-title {
		font-size: 0.875rem;
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.play-btn {
		font-size: 1.5rem;
		padding: 0.25rem 1rem;
	}

	.control-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.control-row span {
		font-size: 0.75rem;
		text-transform: uppercase;
		color: var(--gray-10);
		min-width: 3rem;
	}

	.control-row output {
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		min-width: 2.5rem;
	}
</style>
