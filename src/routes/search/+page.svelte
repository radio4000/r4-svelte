<script>
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {untrack} from 'svelte'
	import {SvelteURLSearchParams} from 'svelte/reactivity'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {addToPlaylist, playTrack, setPlaylist} from '$lib/api'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import SearchStatus from '$lib/components/search-status.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import {trap} from '$lib/focus'
	import {fromAction} from 'svelte/attachments'
	import {searchAll} from '$lib/search'
	import {channelsCollection, tracksCollection} from '$lib/tanstack/collections'
	import * as m from '$lib/paraglide/messages'

	// Trigger channels to load into collection state (needed for search on direct page load)
	const channelsQuery = useLiveQuery((q) => q.from({channels: channelsCollection}))

	let inputValue = $state('')
	let debounceTimer = $state()

	// Sync input with URL param when URL changes externally
	$effect(() => {
		const urlSearch = page.url.searchParams.get('search') || ''
		const currentInput = untrack(() => inputValue)
		if (urlSearch !== currentInput.trim()) {
			inputValue = urlSearch
		}
	})

	function debouncedSearch(value) {
		clearTimeout(debounceTimer)
		debounceTimer = setTimeout(() => {
			const params = new SvelteURLSearchParams(page.url.searchParams)
			if (value.trim()) {
				params.set('search', value.trim())
			} else {
				params.delete('search')
			}
			goto(`/search?${params}`, {replaceState: true})
		}, 300)
	}

	function handleSubmit(event) {
		event.preventDefault()
		clearTimeout(debounceTimer)
		const params = new SvelteURLSearchParams(page.url.searchParams)
		if (inputValue.trim()) {
			params.set('search', inputValue.trim())
			goto(`/search?${params}`, {replaceState: true})
		}
	}

	/** @type {import('$lib/types.ts').Channel[]} */
	let channels = $state([])

	/** @type {import('$lib/types.ts').Track[]} */
	let tracks = $state([])

	let searchQuery = $state('')
	let isLoading = $state(false)

	// Watch for URL changes and update search (wait for channels to load into collection)
	$effect(() => {
		const urlSearch = page.url.searchParams.get('search')
		if (channelsQuery.isLoading) return
		// Wait for channels to actually populate in collection (not just query status)
		if (channelsCollection.state.size === 0) return
		if (urlSearch && urlSearch !== searchQuery) {
			searchQuery = urlSearch
			search()
		} else if (!urlSearch && searchQuery) {
			searchQuery = ''
			clear()
		}
	})

	function clear() {
		channels = []
		tracks = []
	}

	async function search() {
		if (searchQuery.trim().length < 2) return clear()

		isLoading = true
		const results = await searchAll(searchQuery)
		channels = results.channels
		tracks = results.tracks
		isLoading = false
	}

	function writeTracksToCollection() {
		tracksCollection.utils.writeBatch(() => {
			for (const track of tracks) {
				tracksCollection.utils.writeUpsert(track)
			}
		})
	}

	async function playSearchResults() {
		if (!tracks.length) return
		writeTracksToCollection()
		const ids = tracks.map((t) => t.id)
		setPlaylist(ids)
		playTrack(ids[0], null, 'play_search')
	}

	function queueSearchResults() {
		if (!tracks.length) return
		writeTracksToCollection()
		addToPlaylist(tracks.map((t) => t.id))
	}
</script>

<svelte:head>
	<title>{m.search_title()}</title>
</svelte:head>

<article {@attach fromAction(trap)}>
	<form onsubmit={handleSubmit} class="search-form">
		<SearchInput
			bind:value={inputValue}
			placeholder={m.header_search_placeholder()}
			oninput={(e) => debouncedSearch(e.target.value)}
			autofocus
		/>
	</form>

	<menu>
		{#if searchQuery && !isLoading && tracks.length > 0}
			<button type="button" onclick={playSearchResults}>{m.search_play_all()}</button>
			<button type="button" onclick={queueSearchResults}>{m.search_queue_all()}</button>
		{/if}
	</menu>

	<p>
		<SearchStatus {searchQuery} channelCount={channels.length} trackCount={tracks.length} />
	</p>

	{#if searchQuery && isLoading}
		<p><rough-spinner spinner="14" interval="150"></rough-spinner> Searching…</p>
	{:else if searchQuery}
		{#if channels.length === 0 && tracks.length === 0}
			<p>{m.search_no_results()} "{searchQuery}"</p>
			<p>{m.search_tip_slug()}</p>
		{/if}

		{#if channels.length > 0}
			<section>
				<h2>
					{channels.length === 1
						? m.search_channel_one({count: channels.length})
						: m.search_channel_other({count: channels.length})}
				</h2>
				<ul class="grid">
					{#each channels as channel (channel.id)}
						<li>
							<ChannelCard {channel} />
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if tracks.length > 0}
			<section>
				<h2>
					{tracks.length === 1
						? m.search_track_one({count: tracks.length})
						: m.search_track_other({count: tracks.length})}
				</h2>
				<ul class="list">
					{#each tracks as track, index (track.id)}
						<li>
							<TrackCard {track} {index} showSlug={true} />
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{:else if !searchQuery}
		<p>
			{m.search_tip_intro()}
			<br />
			{m.search_tip_header()}
			<br /> <code>{m.search_tip_code_channel()}</code>
			{m.search_tip_channel()}
			<br /> <code>{m.search_tip_code_channel_query()}</code>
			{m.search_tip_channel_query()}
			<br /> <code>/</code>
			{m.search_tip_commands()}
		</p>
	{/if}
</article>

<style>
	.search-form {
		padding: 0.5rem;
		position: sticky;
		top: 0;
		background: var(--body-bg);
		z-index: 10;
	}

	.search-form :global(input) {
		width: 100%;
		font-size: var(--font-3);
	}

	article > p,
	section > h2 {
		margin-left: 0.5rem;
		margin-right: 0.5rem;
	}

	menu {
		margin-left: 0.5rem;
		align-items: center;
	}

	menu,
	section {
		margin-bottom: 1rem;
	}

	.grid :global(article h3 + p) {
		display: none;
	}
</style>
