<script module>
	/** @typedef {'channel' | 'tag'} SourceType */
	/** @typedef {{type: SourceType, value: string, label: string, image?: string | null}} Source */
</script>

<script>
	import {flip} from 'svelte/animate'
	import {crossfade} from 'svelte/transition'
	import {untrack} from 'svelte'

	const [send, receive] = crossfade({
		duration: 250,
		fallback: () => ({duration: 150, css: (t) => `opacity: ${t}; transform: scale(${0.8 + 0.2 * t})`})
	})
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
		void sources.length // react to sources changes
		untrack(() => refreshSuggestions())
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
	}

	/** @param {Source} source */
	function addSource(source) {
		if (!sources.some((s) => s.type === source.type && s.value === source.value)) {
			onadd?.(source)
		}
		searchQuery = ''
		searchResults = []
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

	let displayItems = $derived(searchResults.length ? searchResults : suggestions)
</script>

<section>
	<input
		type="search"
		placeholder="Search channels or #tags..."
		bind:value={searchQuery}
		oninput={debouncedSearch}
		onkeydown={handleInputKeydown}
	/>

	{#if displayItems.length}
		<menu class="suggestions">
			{#if !searchResults.length}
				<button type="button" onclick={() => suggestionSeed++} title="More">↻</button>
			{/if}
			{#each displayItems as item (item.type + item.value)}
				<button
					type="button"
					onclick={() => addSource(item)}
					in:receive={{key: item.type + item.value}}
					out:send={{key: item.type + item.value}}
					animate:flip={{duration: 200}}
				>
					{#if item.type === 'channel'}
						<ChannelAvatar id={item.image} alt="" size={24} />
					{/if}
					{item.label}
				</button>
			{/each}
		</menu>
	{/if}

	{#if sources.length}
		<menu class="sources">
			{#each sources as source (source.type + source.value)}
				<button
					type="button"
					class="chip"
					onclick={() => removeSource(source)}
					in:receive={{key: source.type + source.value}}
					out:send={{key: source.type + source.value}}
					animate:flip={{duration: 200}}
				>
					{source.label} ×
				</button>
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

	section > input {
		width: 100%;
		font-size: var(--font-3);
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
