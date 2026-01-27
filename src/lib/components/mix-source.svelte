<script module>
	/** @typedef {'channel' | 'tag'} SourceType */
	/** @typedef {{type: SourceType, value: string, label: string, image?: string | null}} Source */
</script>

<script>
	import {pickRandomN} from '$lib/lab/selectors'
	import {searchChannels} from '$lib/search'
	import {channelsCollection} from '$lib/tanstack/collections'
	import {mixAll} from '$lib/lab/mix'
	import ChannelAvatar from './channel-avatar.svelte'

	/**
	 * @type {{
	 *   sources: Source[],
	 *   onadd?: (source: Source) => void,
	 *   onremove?: (source: Source) => void
	 * }}
	 */
	let {sources, onadd, onremove} = $props()

	let searchQuery = $state('')
	/** @type {Source[]} */
	let searchResults = $state([])
	let showResults = $state(false)
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let debounceTimer

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
				all.push({type: 'channel', value: ch.slug, label: ch.name || ch.slug, image: ch.image})
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
				label: ch.name || ch.slug,
				image: ch.image
			}))

		const localChannels = [...channelsCollection.state.values()]
			.filter((ch) => ch.slug?.toLowerCase().includes(searchQuery.toLowerCase()) && (ch.track_count ?? 0) >= 1)
			.slice(0, 5)

		const existingSlugs = new Set(searchResults.map((r) => r.value))
		for (const ch of localChannels) {
			if (!existingSlugs.has(ch.slug)) {
				searchResults.push({type: 'channel', value: ch.slug, label: ch.name || ch.slug, image: ch.image})
			}
		}

		showResults = true
	}

	/** @param {Source} source */
	function addSource(source) {
		if (!sources.some((s) => s.type === source.type && s.value === source.value)) {
			onadd?.(source)
		}
		searchQuery = ''
		searchResults = []
		showResults = false
	}

	/** @param {Source} source */
	function removeSource(source) {
		onremove?.(source)
	}

	function debouncedSearch() {
		clearTimeout(debounceTimer)
		debounceTimer = setTimeout(handleSearch, 300)
	}

	/** @param {KeyboardEvent} e */
	function handleInputKeydown(e) {
		if (e.key === 'Enter') {
			e.preventDefault()
			clearTimeout(debounceTimer)
			handleSearch()
		}
	}

	/** @type {HTMLElement | null} */
	let dropdown = $state(null)

	/** @param {FocusEvent} e */
	function handleInputBlur(e) {
		const related = /** @type {HTMLElement | null} */ (e.relatedTarget)
		if (dropdown?.contains(related)) return
		showResults = false
	}
</script>

<section>
	<search>
		<input
			type="search"
			placeholder="Search channels or #tags..."
			bind:value={searchQuery}
			oninput={debouncedSearch}
			onkeydown={handleInputKeydown}
			onfocus={() => searchQuery && handleSearch()}
			onblur={handleInputBlur}
		/>
		{#if showResults && searchResults.length}
			<menu bind:this={dropdown}>
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
				<button type="button" onclick={() => addSource(suggestion)}>
					{#if suggestion.type === 'channel'}
						<ChannelAvatar id={suggestion.image} alt="" size={24} />
					{/if}
					{suggestion.label}
				</button>
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
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	search {
		display: block;
		position: relative;
	}

	search input {
		width: 100%;
		font-size: var(--font-3);
	}

	search menu {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		background: var(--c-gray8, var(--gray-1));
		border: 1px solid var(--c-gray5, var(--gray-5));
		border-radius: var(--border-radius);
		z-index: 10;
		margin-top: 0.2rem;
	}

	search menu button {
		width: 100%;
		text-align: left;
		border: none;
		background: none;
		box-shadow: none;
		font-size: var(--font-2);
		padding: 0.5rem;
		color: var(--c-gray2, var(--gray-11));
	}

	search menu button:hover {
		background: var(--c-gray6, var(--gray-3));
	}

	search menu small {
		color: var(--c-gray4, var(--gray-8));
		font-size: var(--font-1);
		text-transform: uppercase;
		margin-right: 0.5rem;
	}

	.suggestions,
	.sources {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.suggestions {
		min-height: 7rem;
		align-content: start;
	}

	.suggestions button,
	.sources button {
		font-size: var(--font-2);
		padding: 0.2rem 0.5rem;
	}

	.suggestions button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.suggestions button :global(img),
	.suggestions button :global(.placeholder) {
		width: 1.5rem;
		height: 1.5rem;
		flex: none;
	}
</style>
