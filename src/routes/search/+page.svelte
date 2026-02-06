<script>
	import {page} from '$app/state'
	import {goto, afterNavigate} from '$app/navigation'
	import {Debounced} from 'runed'
	import {addToPlaylist, playTrack, setPlaylist} from '$lib/api'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import SearchStatus from '$lib/components/search-status.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import {trap} from '$lib/focus'
	import {fromAction} from 'svelte/attachments'
	import {searchAll} from '$lib/search'
	import {tracksCollection} from '$lib/tanstack/collections'
	import * as m from '$lib/paraglide/messages'

	const uid = $props.id()

	// Form input: initialized from URL, synced on navigation (not $effect — avoids URL→form feedback loop)
	let inputValue = $state(page.url.searchParams.get('search') || '')
	const debouncedInput = new Debounced(() => inputValue, 300)

	// Sync URL → input on external navigation (back/forward, links) — skip our own goto
	afterNavigate(({type}) => {
		if (type === 'goto') return
		inputValue = page.url.searchParams.get('search') || ''
	})

	// Push debounced input → URL
	$effect(() => {
		const search = debouncedInput.current.trim()
		const url = search ? `/search?search=${encodeURIComponent(search)}` : '/search'
		goto(url, {replaceState: true})
	})

	function handleSubmit(event) {
		event.preventDefault()
		if (inputValue.trim()) {
			debouncedInput.setImmediately(inputValue)
		}
	}

	/** @type {import('$lib/types.ts').Channel[]} */
	let channels = $state([])

	/** @type {import('$lib/types.ts').Track[]} */
	let tracks = $state([])

	// Derive search query from URL (single source of truth)
	const searchQuery = $derived(page.url.searchParams.get('search') || '')
	let isLoading = $state(false)
	let lastSearched = '' // plain (untracked) — prevents re-searching same query

	// Trigger search when URL search param changes
	$effect(() => {
		const q = searchQuery
		if (!q || q.trim().length < 2) {
			channels = []
			tracks = []
			lastSearched = ''
			return
		}
		if (q === lastSearched) return
		lastSearched = q
		doSearch(q)
	})

	async function doSearch(/** @type {string} */ query) {
		isLoading = true
		const results = await searchAll(query)
		channels = results.channels
		tracks = results.tracks
		// Write tracks to collection so playTrack(id) can find them
		if (tracks.length) writeTracksToCollection()
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
	<form onsubmit={handleSubmit} class="form search-form">
		<fieldset>
			<label for="{uid}-search" class="visually-hidden">{m.search_title()}</label>
			<SearchInput id="{uid}-search" bind:value={inputValue} placeholder={m.header_search_placeholder()} autofocus />
		</fieldset>
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
		<p>Search channels and tracks on Radio4000.</p>
		<p>
			TIP: find tracks from a channel with <em>@slug [your track query]</em>
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
