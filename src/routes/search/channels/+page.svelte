<script>
	import {page} from '$app/state'
	import {afterNavigate, goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {Debounced} from 'runed'
	import {searchChannels} from '$lib/search-fts'
	import {findChannelBySlug, parseMentionQuery, searchChannelsLocal} from '$lib/search'
	import {channelsCollection} from '$lib/collections/channels'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import SearchShell from '$lib/components/search-shell.svelte'
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
	const featuredChannelSlugs = $derived.by(() => {
		return [...channelsCollection.state.values()]
			.filter((channel) => channel?.slug)
			.toSorted(
				(a, b) =>
					(b.track_count ?? 0) - (a.track_count ?? 0) ||
					(b.latest_track_at ?? '').localeCompare(a.latest_track_at ?? '')
			)
			.slice(0, 6)
			.map((channel) => channel.slug)
	})

	/** @type {import('$lib/types.ts').Channel[]} */
	let channels = $state([])
	let channelsLoading = $state(false)

	$effect(() => {
		const q = debouncedInput.current.trim()
		if (!q) {
			channels = []
			return
		}
		const {channelSlugs, trackQuery} = parseMentionQuery(q)
		channelsLoading = true
		let stale = false
		/** @type {Promise<import('$lib/types').Channel[]>[]} */
		const promises = []
		if (channelSlugs.length) {
			promises.push(
				...channelSlugs.map((slug) => findChannelBySlug(slug).then((channel) => (channel ? [channel] : [])))
			)
		}
		if (trackQuery) {
			const local = searchChannelsLocal(trackQuery, [...channelsCollection.state.values()])
			promises.push(searchChannels(trackQuery))
			if (local.length) promises.push(Promise.resolve(local))
		}
		if (!promises.length) {
			channels = []
			channelsLoading = false
			return
		}
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
	<SearchShell {uid} bind:value={inputValue} onsubmit={handleSubmit} />

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
		<div class="empty-tip">
			<p><small>{m.search_tip_slug()}</small></p>
			{#if featuredChannelSlugs.length}
				<p class="featured-tags">
					<small>{m.search_examples()}</small>
					{#each featuredChannelSlugs as slug (`channel-${slug}`)}
						<a href={resolve('/search/channels') + `?q=${encodeURIComponent('@' + slug)}`}>@{slug}</a>
					{/each}
				</p>
			{/if}
			<p class="browse-links">
				<a href={resolve('/channels/all')}>All {m.explore_tab_channels()}</a>
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

	article > p {
		margin-inline: 0.5rem;
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

	.featured-tags,
	.browse-links {
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
</style>
