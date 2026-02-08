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
	import {parseSearchQueryToView, queryViewTracks} from '$lib/views.svelte'
	import {searchChannels, searchChannelsLocal, findChannelBySlug} from '$lib/search'
	import {channelsCollection} from '$lib/tanstack/collections'
	import * as m from '$lib/paraglide/messages'

	const uid = $props.id()

	// Form input: initialized from URL, synced on navigation (not $effect — avoids URL→form feedback loop)
	let inputValue = $state(page.url.searchParams.get('q') || '')
	const debouncedInput = new Debounced(() => inputValue, 300)

	// Sync URL → input on external navigation (back/forward, links) — skip our own goto
	afterNavigate(({type}) => {
		if (type === 'goto') return
		inputValue = page.url.searchParams.get('q') || ''
	})

	// Push debounced input → URL
	$effect(() => {
		const q = debouncedInput.current.trim()
		const url = q ? `/search?q=${encodeURIComponent(q)}` : '/search'
		goto(url, {replaceState: true})
	})

	function handleSubmit(event) {
		event.preventDefault()
		if (inputValue.trim()) {
			debouncedInput.setImmediately(inputValue)
		}
	}

	// Derive search query from URL (single source of truth)
	const searchQuery = $derived(page.url.searchParams.get('q') || '')

	// Parse the human query into a View
	const view = $derived(searchQuery ? parseSearchQueryToView(searchQuery) : {})

	// Reactive track results via View pipeline
	const viewQuery = queryViewTracks(() => view)

	// Channel results (separate from view tracks)
	/** @type {import('$lib/types.ts').Channel[]} */
	let channels = $state([])
	let channelsLoading = $state(false)

	$effect(() => {
		const v = view
		const q = searchQuery
		if (!q || q.trim().length < 2) {
			channels = []
			return
		}

		/** @type {Promise<import('$lib/types.ts').Channel[]>[]} */
		const promises = []
		if (v.channels?.length) {
			promises.push(...v.channels.map((slug) => findChannelBySlug(slug).then((c) => (c ? [c] : []))))
		}
		if (v.search) {
			promises.push(searchChannels(v.search))
			// Also search locally (includes v1 channels not in Supabase)
			const local = searchChannelsLocal(v.search, [...channelsCollection.state.values()])
			if (local.length) promises.push(Promise.resolve(local))
		}
		if (!promises.length) {
			channels = []
			return
		}

		channelsLoading = true
		let stale = false

		Promise.all(promises).then((results) => {
			if (stale) return
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const seen = new Set()
			channels = results.flat().filter((c) => {
				if (seen.has(c.id)) return false
				seen.add(c.id)
				return true
			})
			channelsLoading = false
		})

		return () => {
			stale = true
		}
	})

	const isLoading = $derived(viewQuery.loading || channelsLoading)
	const tracks = $derived(viewQuery.tracks)

	async function playSearchResults() {
		if (!tracks.length) return
		const ids = tracks.map((t) => t.id)
		setPlaylist(ids)
		playTrack(ids[0], null, 'play_search')
	}

	function queueSearchResults() {
		if (!tracks.length) return
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
				<ul class="grid grid--scroll">
					{#each channels as channel (channel.id)}
						<li>
							<ChannelCard {channel} />
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<menu>
			{#if searchQuery && !isLoading && tracks.length > 0}
				<button type="button" onclick={playSearchResults}>{m.search_play_all()}</button>
				<button type="button" onclick={queueSearchResults}>{m.search_queue_all()}</button>
			{/if}
		</menu>

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
