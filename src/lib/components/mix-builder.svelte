<script module>
	/** @typedef {'channel' | 'tag'} SourceType */
	/** @typedef {{type: SourceType, value: string, label: string}} Source */
</script>

<script>
	import {mix, mixAll} from '$lib/lab/mix'
	import {pickRandomN} from '$lib/lab/selectors'
	import {searchChannels} from '$lib/search'
	import {channelsCollection, ensureTracksLoaded} from '$lib/tanstack/collections'
	import InputRange from './input-range.svelte'

	/** @type {{sources: Source[], options: {shuffle: boolean, withoutErrors: boolean, limit: number}}} */
	let {sources = $bindable([]), options = $bindable({shuffle: false, withoutErrors: false, limit: 50})} = $props()

	let loading = $state(false)

	// Load tracks for selected channels reactively
	$effect(() => {
		const slugs = sources.filter((s) => s.type === 'channel').map((s) => s.value)
		if (!slugs.length) return
		loading = true
		Promise.all(slugs.map(ensureTracksLoaded)).finally(() => {
			loading = false
		})
	})

	let searchQuery = $state('')
	/** @type {Source[]} */
	let searchResults = $state([])
	let showResults = $state(false)

	/** @type {Source[]} */
	let suggestions = $state([])
	let suggestionSeed = $state(0)

	/** Get all available channels and tags */
	function getAllSources() {
		/** @type {Source[]} */
		const all = []

		// Add channels from local collection (with at least 1 track)
		for (const ch of channelsCollection.state.values()) {
			if (ch.slug && (ch.track_count ?? 0) >= 1) {
				all.push({type: 'channel', value: ch.slug, label: ch.name || ch.slug})
			}
		}

		// Extract tags from all loaded tracks via mix
		/** @type {Record<string, number>} */
		const tagCounts = {}
		for (const track of mixAll().tracks()) {
			if (track.tags) {
				for (const tag of track.tags) {
					const key = tag.toLowerCase()
					tagCounts[key] = (tagCounts[key] || 0) + 1
				}
			}
		}
		// Add tags that appear on at least 2 tracks
		for (const [tag, count] of Object.entries(tagCounts)) {
			if (count >= 2) {
				all.push({type: 'tag', value: tag, label: `#${tag}`})
			}
		}

		return all
	}

	function refreshSuggestions() {
		const all = getAllSources()
		const available = all.filter((s) => !sources.some((sel) => sel.type === s.type && sel.value === s.value))
		suggestions = pickRandomN(10)(available)
	}

	$effect(() => {
		void suggestionSeed
		refreshSuggestions()
	})

	/**
	 * Build a mix from current sources.
	 * - Channels only: union of tracks from those channels
	 * - Tags only: filter all loaded tracks by tags (must have ALL selected tags)
	 * - Channels + tags: filter channel tracks by tags (intersection)
	 */
	function buildMix() {
		const channelSources = sources.filter((s) => s.type === 'channel')
		const tagSources = sources.filter((s) => s.type === 'tag')

		// Base: selected channels, or all loaded tracks if no channels
		let m = channelSources.length > 0 ? mix() : mixAll()

		for (const source of channelSources) {
			m = m.from(source.value)
		}

		// Tags filter the base (must have ALL selected tags)
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

	async function handleSearch() {
		if (!searchQuery.trim()) {
			searchResults = []
			return
		}

		if (searchQuery.startsWith('#')) {
			const tag = searchQuery.slice(1)
			if (tag) {
				searchResults = [{type: 'tag', value: tag, label: `#${tag}`}]
			}
			showResults = true
			return
		}

		const channels = await searchChannels(searchQuery, {limit: 10})
		searchResults = channels
			.filter((ch) => (ch.track_count ?? 0) >= 1)
			.map((ch) => ({
				type: 'channel',
				value: ch.slug,
				label: ch.name || ch.slug
			}))

		const localChannels = [...channelsCollection.state.values()]
			.filter((ch) => ch.slug?.toLowerCase().includes(searchQuery.toLowerCase()) && (ch.track_count ?? 0) >= 1)
			.slice(0, 5)

		const existingSlugs = new Set(searchResults.map((r) => r.value))
		for (const ch of localChannels) {
			if (!existingSlugs.has(ch.slug)) {
				searchResults.push({type: 'channel', value: ch.slug, label: ch.name || ch.slug})
			}
		}

		showResults = true
	}

	/** @param {Source} source */
	function addSource(source) {
		if (!sources.some((s) => s.type === source.type && s.value === source.value)) {
			sources = [...sources, source]
		}
		searchQuery = ''
		searchResults = []
		showResults = false
	}

	/** @param {Source} source */
	function removeSource(source) {
		sources = sources.filter((s) => !(s.type === source.type && s.value === source.value))
	}

	/** @param {KeyboardEvent} e */
	function handleInputKeydown(e) {
		if (e.key === 'Enter') {
			e.preventDefault()
			handleSearch()
		}
	}

	function handleInputBlur() {
		setTimeout(() => {
			showResults = false
		}, 200)
	}
</script>

<section>
	<search>
		<input
			type="search"
			placeholder="Search channels or #tags..."
			bind:value={searchQuery}
			onkeydown={handleInputKeydown}
			onfocus={() => searchQuery && handleSearch()}
			onblur={handleInputBlur}
		/>
		{#if showResults && searchResults.length}
			<menu>
				{#each searchResults as result (result.value)}
					<li>
						<button type="button" onclick={() => addSource(result)}>
							<small>{result.type === 'tag' ? 'tag' : 'channel'}</small>
							{result.label}
						</button>
					</li>
				{/each}
			</menu>
		{/if}
	</search>

	{#if suggestions.length}
		<menu class="suggestions">
			<button type="button" onclick={() => suggestionSeed++} title="More">↻</button>
			{#each suggestions as suggestion (suggestion.type + suggestion.value)}
				<button type="button" onclick={() => addSource(suggestion)}>{suggestion.label}</button>
			{/each}
		</menu>
	{/if}

	{#if sources.length}
		<menu class="sources">
			{#each sources as source (source.type + source.value)}
				<button type="button" class="chip" onclick={() => removeSource(source)}>{source.label} ×</button>
			{/each}
		</menu>
	{/if}

	<menu class="options">
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
		<label>
			<InputRange bind:value={options.limit} min={10} max={200} step={10} visualStep={20} />
			<output>{loading ? '...' : trackCount} tracks</output>
		</label>
	</menu>
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	search {
		display: block;
		position: relative;
	}

	search input {
		width: 100%;
		font-size: 13px;
	}

	search menu {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		background: var(--gray-1);
		border: 1px solid var(--gray-5);
		border-radius: 4px;
		z-index: 10;
		margin-top: 2px;
	}

	search menu button {
		width: 100%;
		text-align: left;
		border: none;
		background: none;
		box-shadow: none;
		font-size: 12px;
		padding: 6px 8px;
	}

	search menu button:hover {
		background: var(--gray-3);
	}

	search menu small {
		color: var(--gray-8);
		font-size: 10px;
		text-transform: uppercase;
		margin-right: 6px;
	}

	.suggestions,
	.sources {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.suggestions button,
	.sources button {
		font-size: 12px;
		padding: 4px 8px;
	}

	.options {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.options button {
		font-size: 12px;
		padding: 4px 10px;
	}

	.options label {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 120px;
	}

	.options label :global(.input-range) {
		flex: 1;
	}

	.options output {
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		color: var(--gray-9);
		white-space: nowrap;
	}
</style>
