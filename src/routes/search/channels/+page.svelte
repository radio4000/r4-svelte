<script>
	import {page} from '$app/state'
	import {afterNavigate, goto} from '$app/navigation'
	import {Debounced} from 'runed'
	import {searchChannels} from '$lib/search-fts'
	import {searchChannelsLocal} from '$lib/search'
	import {channelsCollection} from '$lib/collections/channels'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import SearchTabs from '$lib/components/search-tabs.svelte'
	import {trap} from '$lib/focus'
	import {fromAction} from 'svelte/attachments'
	import * as m from '$lib/paraglide/messages'

	const uid = $props.id()

	let inputValue = $state(page.url.searchParams.get('q') ?? '')
	const debouncedInput = new Debounced(() => inputValue, 300)

	let inputSeeded = !!page.url.searchParams.get('q')
	afterNavigate(({type}) => {
		if (type === 'goto') return
		const q = page.url.searchParams.get('q') ?? ''
		inputValue = q
		inputSeeded = !!q
	})

	$effect(() => {
		const q = debouncedInput.current.trim()
		if (!q) return
		if (inputSeeded) {
			inputSeeded = false
			return
		}
		goto(`/search/channels?q=${encodeURIComponent(q)}`, {replaceState: true})
	})

	function handleSubmit(e) {
		e.preventDefault()
		const q = inputValue.trim()
		if (!q) {
			goto('/search/channels', {replaceState: true})
			return
		}
		debouncedInput.setImmediately(inputValue)
	}

	const hasFilter = $derived(!!debouncedInput.current.trim())

	/** @type {import('$lib/types.ts').Channel[]} */
	let channels = $state([])
	let channelsLoading = $state(false)

	$effect(() => {
		const q = debouncedInput.current.trim()
		if (!q) {
			channels = []
			return
		}
		channelsLoading = true
		let stale = false
		const local = searchChannelsLocal(q, [...channelsCollection.state.values()])
		const promises = [searchChannels(q)]
		if (local.length) promises.push(Promise.resolve(local))
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
	</header>

	{#if hasFilter}
		{#if channelsLoading}
			<p>{m.search_loading_channels()}</p>
		{:else if channels.length}
			<ul class="list">
				{#each channels as channel (channel.id)}
					<li><ChannelCard {channel} /></li>
				{/each}
			</ul>
		{:else}
			<p>{m.search_no_results()} "{inputValue}"</p>
		{/if}
	{:else}
		<p><small>{m.search_tip_slug()}</small></p>
	{/if}
</article>

<style>
	.search-header {
		position: sticky;
		top: 0;
		background: var(--body-bg);
		z-index: 3;
		padding: 0.5rem;
		display: flex;
		align-items: flex-start;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.search-header :global(.search-tabs) {
		flex-shrink: 0;
	}

	.search-header form {
		flex: 1 1 0;
		min-width: min(200px, 100%);
	}

	.search-header form :global(input) {
		width: 100%;
	}

	article > p {
		margin-inline: 0.5rem;
	}
</style>
