<script>
	import {page} from '$app/state'
	import {afterNavigate, goto} from '$app/navigation'
	import {setScene} from '$lib/scene-state.svelte'
	import {Debounced} from 'runed'
	import {queryView, getAutoDecksForView} from '$lib/views.svelte'
	import {parseView, serializeView, viewFromUrl, viewLabel} from '$lib/views'
	import ViewsBar from '$lib/components/views-bar.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import {searchChannels} from '$lib/search-fts'
	import {searchChannelsLocal, findChannelBySlug} from '$lib/search'
	import {channelsCollection} from '$lib/collections/channels'
	import {tracksCollection} from '$lib/collections/tracks'
	import {getChannelTags} from '$lib/utils'
	import {resolve} from '$app/paths'
	import {addToPlaylist, joinAutoRadio, playTrack, setPlaylist} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import ButtonFeedback from '$lib/components/button-feedback.svelte'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import Icon from '$lib/components/icon.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import SearchTabs from '$lib/components/search-tabs.svelte'
	import {trap} from '$lib/focus'
	import {fromAction} from 'svelte/attachments'
	import {toAutoTracks, hasAutoRadioCoverage} from '$lib/player/auto-radio'
	import * as m from '$lib/paraglide/messages'

	setScene({
		geometry: 'icosahedron',
		backgroundColor: 'oklch(10% 0.05 200)',
		cameraPosition: [0, 0, 5],
		rotationSpeed: 0.5
	})

	const uid = $props.id()

	// --- Smart input (local, ephemeral) ---
	let inputValue = $state(page.url.searchParams.get('q') ?? '')
	const debouncedInput = new Debounced(() => inputValue, 300)

	// --- URL is the single source of truth ---
	const view = $derived(viewFromUrl(page.url))
	const q = $derived(view.sources[0] ?? {})
	const hasFilter = $derived(!!q.channels?.length || !!q.tags?.length || !!q.search)

	// --- View → URL ---
	function viewToUrl(v) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams()
		const q = viewLabel(v)
		if (q) params.set('q', q)
		if (v.order) params.set('order', v.order)
		if (v.direction) params.set('direction', v.direction)
		if (v.limit) params.set('limit', String(v.limit))
		if (v.offset) params.set('offset', String(v.offset))
		const str = params.toString()
		return str ? `/search?${str}` : '/search'
	}

	// --- Sync input from URL on landing + browser back/forward ---
	let inputSeeded = !!page.url.searchParams.get('q')
	afterNavigate(({type}) => {
		if (type === 'goto') return
		const seeded = page.url.searchParams.get('q') ?? ''
		inputValue = seeded
		inputSeeded = !!seeded
	})

	// --- Smart input → URL ---
	$effect(() => {
		const q = debouncedInput.current.trim()
		if (!q) return
		if (inputSeeded) {
			inputSeeded = false
			return
		}
		const resolved = parseView(q)
		goto(viewToUrl(resolved), {replaceState: true})
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
		inputValue = viewLabel(v)
		goto(viewToUrl(v), {replaceState: true})
	}

	// --- Play / Queue ---
	const deckKeys = $derived(Object.keys(appState.decks))
	const multiDeck = $derived(deckKeys.length > 1)
	const deckLabel = $derived(multiDeck ? `Deck ${deckKeys.indexOf(String(appState.active_deck_id)) + 1}` : '')

	async function playSearchResults() {
		if (!tracks.length) return
		const ids = tracks.map((t) => t.id)
		await playTrack(appState.active_deck_id, ids[0], null, 'play_search')
		// Set playlist after playTrack so the search results are the final queue,
		// even if playTrack auto-created a deck or set channel tracks internally.
		setPlaylist(appState.active_deck_id, ids, {title: inputValue.trim()})
	}

	function queueSearchResults() {
		if (!tracks.length) return
		addToPlaylist(
			appState.active_deck_id,
			tracks.map((t) => t.id)
		)
	}

	// --- Track results (View pipeline) ---
	const viewQuery = queryView(() => view)
	const tracks = $derived(viewQuery.tracks)
	const tracksLoading = $derived(viewQuery.loading)
	const autoRadioTracks = $derived(toAutoTracks(tracks))
	const canShowAutoRadio = $derived(hasAutoRadioCoverage(tracks))
	const searchAutoDecks = $derived.by(() => getAutoDecksForView(Object.values(appState.decks), view))
	const isSearchAutoActive = $derived(searchAutoDecks.length > 0)
	const isSearchAutoDrifted = $derived(searchAutoDecks.some((d) => d.auto_radio_drifted))

	// --- Featured examples for empty state ---
	const featuredChannelSlugs = $derived.by(() => {
		return [...channelsCollection.state.values()]
			.filter((channel) => channel?.slug)
			.toSorted(
				(a, b) =>
					(b.track_count ?? 0) - (a.track_count ?? 0) ||
					(b.latest_track_at ?? '').localeCompare(a.latest_track_at ?? '')
			)
			.slice(0, 3)
			.map((channel) => channel.slug)
	})
	const featuredTags = $derived.by(() => {
		const tracks = [...tracksCollection.state.values()]
		if (!tracks.length) return []
		return getChannelTags(tracks)
			.slice(0, 6)
			.map((t) => t.value)
	})

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
		if (q.channels?.length) {
			promises.push(...q.channels.map((slug) => findChannelBySlug(slug).then((c) => (c ? [c] : []))))
		}
		if (q.search) {
			promises.push(searchChannels(q.search))
			const local = searchChannelsLocal(q.search, [...channelsCollection.state.values()])
			if (local.length) promises.push(Promise.resolve(local))
		}
		if (!promises.length) {
			channels = []
			return
		}
		channelsLoading = true
		let stale = false
		Promise.all(promises)
			.then((results) => {
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
			.catch(() => {
				if (!stale) channelsLoading = false
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
	<header class="search-header">
		<SearchTabs />
		<form onsubmit={handleSubmit}>
			<label for="{uid}-search" class="visually-hidden">{m.search_title()}</label>
			<SearchInput id="{uid}-search" bind:value={inputValue} placeholder={m.header_search_placeholder()} autofocus />
		</form>
		<ViewsBar {view} onchange={onViewsBarChange} />
	</header>

	{#if hasFilter}
		{#if !channelsLoading && !tracksLoading && channels.length === 0 && tracks.length === 0}
			<p>{m.search_no_results()} "{inputValue || serializeView(view)}"</p>
			<p>{m.search_tip_slug()}</p>
		{/if}

		{#if channelsLoading}
			<p>{m.search_loading_channels()}</p>
		{:else if channels.length}
			<section>
				<h2>
					{channels.length === 1
						? m.search_channel_one({count: channels.length})
						: m.search_channel_other({count: channels.length})}
				</h2>
				<ul class={channels.length < 3 ? 'list' : 'grid grid--scroll'}>
					{#each channels as channel (channel.id)}
						<li><ChannelCard {channel} /></li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if tracksLoading}
			<p>{m.search_loading_tracks()}</p>
		{:else if tracks.length}
			<section class="track-results">
				<header>
					<h2>
						{tracks.length === 1
							? m.search_track_one({count: tracks.length})
							: m.search_track_other({count: tracks.length})}
					</h2>
					<menu>
						<ButtonFeedback onclick={playSearchResults}>
							{#snippet successChildren()}<Icon icon="play-fill" />
								{m.search_playing({count: tracks.length})}{/snippet}
							<Icon icon="play-fill" />{multiDeck ? m.search_play_on_deck({deck: deckLabel}) : m.search_play_all()}
						</ButtonFeedback>
						<ButtonFeedback onclick={queueSearchResults}>
							{#snippet successChildren()}<Icon icon="next-fill" />
								{m.search_queued({count: tracks.length})}{/snippet}
							<Icon icon="next-fill" />{multiDeck ? m.search_add_to_deck({deck: deckLabel}) : m.search_queue_all()}
						</ButtonFeedback>
						{#if canShowAutoRadio}
							<AutoRadioButton
								synced={isSearchAutoActive && !isSearchAutoDrifted}
								title={isSearchAutoDrifted ? m.auto_radio_resync() : m.search_auto_radio_this()}
								onclick={() => joinAutoRadio(appState.active_deck_id, autoRadioTracks, view)}
							/>
						{/if}
					</menu>
				</header>
				<ul class="list">
					{#each tracks as track, index (track.id)}
						<li><TrackCard {track} {index} showSlug={true} /></li>
					{/each}
				</ul>
			</section>
		{/if}
	{:else}
		<div class="empty-tip">
			<p><small>{m.search_tip_slug()}</small></p>
			{#if featuredChannelSlugs.length || featuredTags.length}
				<p class="featured-tags">
					<small>{m.search_examples()}</small>
					{#each featuredChannelSlugs as slug (`channel-${slug}`)}
						<a href={resolve('/search') + `?q=${encodeURIComponent('@' + slug)}`}>@{slug}</a>
					{/each}
					{#each featuredTags as tag (`tag-${tag}`)}
						<a href={resolve('/search/tracks') + `?q=${encodeURIComponent('#' + tag)}`}>#{tag}</a>
					{/each}
				</p>
			{/if}
			<p class="browse-links">
				<a href={resolve('/channels/all')}>All {m.explore_tab_channels()}</a>
				<a href={resolve('/tracks/recent')}>All {m.explore_tab_tracks()}</a>
			</p>
		</div>
	{/if}
</article>

<style>
	article {
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	.search-header {
		position: sticky;
		top: 0;
		background: var(--body-bg);
		/* Default page controls layer: above content, below app overlays/fullscreen deck. */
		z-index: 3;
		padding: 0.5rem;
		display: flex;
		align-items: flex-start;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.search-header :global(.popover-menu) {
		flex-shrink: 0;
	}

	.search-header form {
		flex: 1 1 0;
		min-width: min(200px, 100%);
	}

	.search-header form :global(input) {
		width: 100%;
	}

	.search-header :global(.views-bar) {
		flex-shrink: 0;
	}

	article > p,
	section > h2 {
		margin-inline: 0.5rem;
	}

	.track-results > header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding-inline: 0.5rem;
	}

	.track-results > header > menu {
		margin-left: 0;
		flex-wrap: wrap;
	}

	menu,
	section {
		margin-bottom: 1rem;
	}

	.empty-tip {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin: 0;
	}

	.featured-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.5rem;
		justify-content: center;
		color: light-dark(var(--gray-9), var(--gray-8));

		a {
			color: var(--accent-9);
			text-decoration: none;
			&:hover {
				text-decoration: underline;
			}
		}
	}

	.browse-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		justify-content: center;

		a {
			color: var(--accent-9);
			text-decoration: none;
			&:hover {
				text-decoration: underline;
			}
		}
	}
</style>
