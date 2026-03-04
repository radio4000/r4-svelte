<script lang="ts">
	import {onMount} from 'svelte'
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import {viewFromUrl, viewLabel, type View} from '$lib/views'
	import {queryView} from '$lib/views.svelte'
	import {appState, createDefaultDeck} from '$lib/app-state.svelte'
	import {setPlaylist} from '$lib/api'
	import {ensureTracksLoaded} from '$lib/collections/tracks'

	/*
		This page basically takes a View from the ?q url param,
		turns it into a valid Deck,
		runs ensureTracksLoaded -> setPlaylist on the deck

		(and hides the main app layout)
*/

	const rawView: View = $derived.by(() => viewFromUrl(page.url))
	const hasView = $derived(rawView.sources.some((s) => s.channels?.length || s.tags?.length || s.search))

	function viewToDecks(view: View): Record<number, ReturnType<typeof createDefaultDeck>> {
		if (!view.sources.length) return {1: createDefaultDeck(1)}
		return Object.fromEntries(
			view.sources.map((source, i) => {
				const id = i + 1
				return [
					id,
					{
						...createDefaultDeck(id),
						view: {sources: [source], order: view.order, direction: view.direction, limit: view.limit}
					}
				]
			})
		)
	}

	function applyDecks(decks: Record<number, ReturnType<typeof createDefaultDeck>>) {
		const ids = Object.keys(decks).map(Number)
		appState.decks = decks
		appState.active_deck_id = ids[0]
		appState.next_deck_id = Math.max(...ids) + 1
	}

	onMount(() => {
		const savedDecks = $state.snapshot(appState.decks)
		const savedActiveDeckId = appState.active_deck_id
		const savedNextDeckId = appState.next_deck_id
		return () => {
			appState.decks = savedDecks
			appState.active_deck_id = savedActiveDeckId
			appState.next_deck_id = savedNextDeckId
		}
	})

	$effect(() => {
		applyDecks(hasView ? viewToDecks(rawView) : {1: createDefaultDeck(1)})
	})

	// One per-source view — load tracks and set playlist per deck
	const deckViews = $derived(
		rawView.sources.map((source, i) => ({
			deckId: i + 1,
			view: {sources: [source], order: rawView.order, direction: rawView.direction, limit: rawView.limit} satisfies View
		}))
	)

	$effect(() => {
		for (const {view} of deckViews) {
			const slugs = view.sources.flatMap((s) => s.channels ?? [])
			for (const slug of slugs) ensureTracksLoaded(slug)
		}
	})

	const viewQueries = $derived(deckViews.map(({deckId, view}) => ({deckId, view, query: queryView(() => view)})))

	$effect(() => {
		for (const {deckId, view, query} of viewQueries) {
			if (query.loading || !query.tracks.length) continue
			const channels = view.sources[0]?.channels ?? []
			const slug = channels.length === 1 ? channels[0] : undefined
			setPlaylist(
				deckId,
				query.tracks.map((t) => t.id),
				{title: viewLabel(view), slug}
			)
		}
	})

	let inputQ = $state(page.url.searchParams.get('q') ?? '')
	let inputLimit = $state(Number(page.url.searchParams.get('limit') ?? '') || null)

	function navigate(e: Event) {
		e.preventDefault()
		const params = new URLSearchParams()
		if (inputQ.trim()) params.set('q', inputQ.trim())
		if (inputLimit) params.set('limit', String(inputLimit))
		goto(`/embed?${params}`)
	}
</script>

<details>
	<summary>debug</summary>
	<form onsubmit={navigate}>
		<input bind:value={inputQ} placeholder="@ko002 @oskar #jazz; @good-time-radio" size="40" />
		<input bind:value={inputLimit} placeholder="limit" type="number" min="1" max="4000" style="width:5rem" />
		<button type="submit">Load</button>
	</form>
	<pre>{JSON.stringify(rawView, null, 2)}</pre>
</details>

<style>
	:global(.layout > header) {
		display: none !important;
	}
</style>
