<script>
	import {appState} from '$lib/app-state.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.js'
	import * as m from '$lib/paraglide/messages'
	import {followsCollection, channelsCollection} from '../tanstack/collections'

	/** @type {import('$lib/types').Channel[]} */
	let followings = $derived(
		[...followsCollection.state.values()]
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
			.map((f) => {
				const channel = channelsCollection.get(f.channelId)
				return channel ? {...channel, source: f.source} : null
			})
			.filter((ch) => ch !== null)
	)
</script>

<svelte:head>
	<title>{m.page_title_following()}</title>
</svelte:head>

<article>
	<header>
		<h1>{m.following_title({count: followings?.length || 0})}</h1>
		{#if appState.user}
			<p>{m.following_synced()}</p>
		{:else}
			<p>{m.following_tip_signin()}</p>
		{/if}
	</header>

	{#if followings?.length === 0}
		<p>{m.following_empty()}</p>
	{:else}
		<div class="grid">
			{#each followings as following (following.id)}
				<ChannelCard channel={following}>
					{#if following.source === 'v1'}
						<small {@attach tooltip({content: m.tooltip_v1_channel()})}>{m.following_v1_local()}</small>
					{/if}
				</ChannelCard>
			{/each}
		</div>
	{/if}
</article>

<style>
	article {
		margin: 0.5rem 0.5rem var(--player-compact-size);
	}
</style>
