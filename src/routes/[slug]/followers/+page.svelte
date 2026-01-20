<script>
	import {page} from '$app/state'
	import {useLiveQuery} from '$lib/tanstack/useLiveQuery.svelte.js'
	import {channelsCollection} from '$lib/tanstack/collections'
	import {eq} from '@tanstack/db'
	import {sdk} from '@radio4000/sdk'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import SortControls from '$lib/components/sort-controls.svelte'
	import * as m from '$lib/paraglide/messages'

	let slug = $derived(page.params.slug)

	const channelQuery = useLiveQuery((q) =>
		q
			.from({channels: channelsCollection})
			.where(({channels}) => eq(channels.slug, slug))
			.orderBy(({channels}) => channels.created_at, 'desc')
			.limit(1)
	)
	let channel = $derived(channelQuery.data?.[0])

	let followers = $state([])
	let loading = $state(true)
	let order = $state('updated')
	let direction = $state('desc')

	$effect(() => {
		if (channel?.id) {
			loading = true
			sdk.channels.readFollowers(channel.id).then(({data}) => {
				if (data) followers = data
				loading = false
			})
		}
	})

	const sortKey = {
		updated: (c) => c.latest_track_at || c.updated_at || '',
		created: (c) => c.created_at || '',
		name: (c) => c.name?.toLowerCase() || '',
		tracks: (c) => c.track_count || 0
	}

	let sortedFollowers = $derived(
		[...followers].sort((a, b) => {
			const av = sortKey[order](a)
			const bv = sortKey[order](b)
			const cmp = av < bv ? -1 : av > bv ? 1 : 0
			return direction === 'asc' ? cmp : -cmp
		})
	)
</script>

<svelte:head>
	<title>{m.nav_followers()} - {channel?.name}</title>
</svelte:head>

<article>
	<header>
		<div class="header-top">
			<h1>{m.nav_followers()} <small>({followers.length})</small></h1>
			<div class="controls">
				<SortControls bind:order bind:direction />
			</div>
		</div>
	</header>

	{#if loading}
		<p>{m.common_loading()}</p>
	{:else if followers.length === 0}
		<p>{m.empty_placeholder()}</p>
	{:else}
		<div class="grid">
			{#each sortedFollowers as follower (follower.id)}
				<ChannelCard channel={follower} />
			{/each}
		</div>
	{/if}
</article>

<style>
	.header-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
	}
	.controls {
		display: flex;
		gap: 0.5rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 1rem;
	}
	h1 small {
		font-size: 0.6em;
		opacity: 0.7;
	}
</style>
