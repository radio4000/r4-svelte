<script>
	import {page} from '$app/state'
	import {afterNavigate, goto} from '$app/navigation'
	import {Debounced} from 'runed'
	import {parseSearchQueryToView, parseView, serializeView, viewToQuery, queryViewTracks} from '$lib/views.svelte'
	import ViewsBar from '$lib/components/views-bar.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import {searchChannels} from '$lib/search-fts'
	import {searchChannelsLocal, findChannelBySlug} from '$lib/search'
	import {channelsCollection} from '$lib/tanstack/collections'
	import {addToPlaylist, playTrack, setPlaylist} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import ButtonFeedback from '$lib/components/button-feedback.svelte'
	import Icon from '$lib/components/icon.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import {trap} from '$lib/focus'
	import {fromAction} from 'svelte/attachments'
	import * as m from '$lib/paraglide/messages'

	const uid = $props.id()

	// --- Smart input (local, ephemeral) ---
	let inputValue = $state('')
	const debouncedInput = new Debounced(() => inputValue, 300)

	// --- URL is the single source of truth ---
	const view = $derived(parseView(page.url.searchParams))
	const hasFilter = $derived(!!view.channels?.length || !!view.tags?.length || !!view.search)

	// --- Resolve ?q= on arrival → rewrite to view params ---
	// ?q= is a human-friendly entry point. Resolves once, rewrites URL, done.
	// Browser treats # as fragment separator, so ?q=@ko002 #pm dance arrives as
	// q="@ko002 " with hash="#pm dance". Recombine them before parsing.
	$effect(() => {
		if (!page.url.searchParams.has('q')) return
		const q = page.url.searchParams.get('q') || ''
		const hash = page.url.hash || ''
		const fullQuery = (q + hash).trim()
		if (!fullQuery) return
		inputValue = fullQuery
		const resolved = parseSearchQueryToView(fullQuery)
		const params = serializeView(resolved).toString()
		goto(params ? `/search?${params}` : '/search', {replaceState: true})
	})

	// --- Sync input from URL on landing + browser back/forward ---
	// Skips 'goto' (our own navigations) and '?q=' (handled by resolve effect above).
	let inputSeeded = false
	afterNavigate(({type}) => {
		if (type === 'goto') return
		if (page.url.searchParams.has('q')) return
		const seeded = viewToQuery(parseView(page.url.searchParams))
		inputValue = seeded
		inputSeeded = !!seeded
	})

	// --- Smart input → resolve to view params → URL ---
	// Dependencies: only debouncedInput.current. Does NOT read URL, so no cycle.
	$effect(() => {
		const q = debouncedInput.current.trim()
		if (!q) return
		if (inputSeeded) {
			inputSeeded = false
			return
		}
		const resolved = parseSearchQueryToView(q)
		const params = serializeView(resolved).toString()
		goto(params ? `/search?${params}` : '/search', {replaceState: true})
	})

	function handleSubmit(e) {
		e.preventDefault()
		const q = inputValue.trim()
		if (!q) {
			goto('/search', {replaceState: true})
			return
		}
		debouncedInput.setImmediately(inputValue)
	}

	// --- ViewsBar → URL ---
	function onViewsBarChange(v) {
		inputSeeded = true
		inputValue = viewToQuery(v)
		const params = serializeView(v).toString()
		goto(params ? `/search?${params}` : '/search', {replaceState: true})
	}

	// --- Play / Queue ---
	const deckKeys = $derived(Object.keys(appState.decks))
	const multiDeck = $derived(deckKeys.length > 1)
	const deckLabel = $derived(multiDeck ? `Deck ${deckKeys.indexOf(String(appState.active_deck_id)) + 1}` : '')

	function playSearchResults() {
		if (!tracks.length) return
		const ids = tracks.map((t) => t.id)
		setPlaylist(appState.active_deck_id, ids, {title: inputValue.trim()})
		playTrack(appState.active_deck_id, ids[0], null, 'play_search')
	}

	function queueSearchResults() {
		if (!tracks.length) return
		addToPlaylist(
			appState.active_deck_id,
			tracks.map((t) => t.id)
		)
	}

	// --- Track results (View pipeline) ---
	const viewQuery = queryViewTracks(() => view)
	const tracks = $derived(viewQuery.tracks)
	const tracksLoading = $derived(viewQuery.loading)

	// --- Channel results (parallel, outside View) ---
	/** @type {import('$lib/types.ts').Channel[]} */
	let channels = $state([])
	let channelsLoading = $state(false)

	$effect(() => {
		if (!hasFilter) {
			channels = []
			return
		}
		/** @type {Promise<import('$lib/types.ts').Channel[]>[]} */
		const promises = []
		if (view.channels?.length) {
			promises.push(...view.channels.map((slug) => findChannelBySlug(slug).then((c) => (c ? [c] : []))))
		}
		if (view.search) {
			promises.push(searchChannels(view.search))
			const local = searchChannelsLocal(view.search, [...channelsCollection.state.values()])
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
</script>

<svelte:head>
	<title>{m.search_title()}</title>
</svelte:head>

<article {@attach fromAction(trap)}>
	<form onsubmit={handleSubmit}>
		<label for="{uid}-search" class="visually-hidden">{m.search_title()}</label>
		<SearchInput id="{uid}-search" bind:value={inputValue} placeholder={m.header_search_placeholder()} autofocus />
	</form>

	<ViewsBar {view} onchange={onViewsBarChange} />

	{#if hasFilter}
		{#if !channelsLoading && !tracksLoading && channels.length === 0 && tracks.length === 0}
			<p>{m.search_no_results()} "{inputValue || serializeView(view)}"</p>
			<p>{m.search_tip_slug()}</p>
		{/if}

		{#if channelsLoading}
			<p><rough-spinner spinner="14" interval="150"></rough-spinner> Searching channels…</p>
		{:else if channels.length}
			<section>
				<h2>
					{channels.length === 1
						? m.search_channel_one({count: channels.length})
						: m.search_channel_other({count: channels.length})}
				</h2>
				<ul class="grid grid--scroll">
					{#each channels as channel (channel.id)}
						<li><ChannelCard {channel} /></li>
					{/each}
				</ul>
			</section>
		{/if}

		<menu>
			{#if !tracksLoading && tracks.length > 0}
				<ButtonFeedback onclick={playSearchResults}>
					{#snippet successChildren()}<Icon icon="play-fill" size={16} /> Playing {tracks.length}{/snippet}
					<Icon icon="play-fill" size={16} />{multiDeck ? `Play on ${deckLabel}` : m.search_play_all()}
				</ButtonFeedback>
				<ButtonFeedback onclick={queueSearchResults}>
					{#snippet successChildren()}<Icon icon="next-fill" size={16} /> Queued {tracks.length}{/snippet}
					<Icon icon="next-fill" size={16} />{multiDeck ? `Add to ${deckLabel}` : m.search_queue_all()}
				</ButtonFeedback>
			{/if}
		</menu>

		{#if tracksLoading}
			<p><rough-spinner spinner="14" interval="150"></rough-spinner> Searching tracks…</p>
		{:else if tracks.length}
			<section>
				<h2>
					{tracks.length === 1
						? m.search_track_one({count: tracks.length})
						: m.search_track_other({count: tracks.length})}
				</h2>
				<ul class="list">
					{#each tracks as track, index (track.id)}
						<li><TrackCard {track} {index} showSlug={true} /></li>
					{/each}
				</ul>
			</section>
		{/if}
	{:else}
		<p><small>{m.search_tip_slug()}</small></p>
	{/if}
</article>

<style>
	form {
		padding: 0.5rem;
		position: sticky;
		top: 0;
		background: var(--body-bg);
		z-index: 10;
	}

	form :global(input) {
		width: 100%;
	}

	:global(.views-bar) {
		margin: 0 0.5rem 1rem;
	}

	article > p,
	section > h2 {
		margin-inline: 0.5rem;
	}

	menu {
		margin-left: 0.5rem;
		align-items: center;
	}

	menu,
	section {
		margin-bottom: 1rem;
	}
</style>
