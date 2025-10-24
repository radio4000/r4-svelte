<script>
	import {useAppState} from '$lib/app-state.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.js'

	const appState = useAppState()

	/** @type {import('./$types').PageData} */
	let {data} = $props()

	let followings = $derived(data.followings)
</script>

<svelte:head>
	<title>Following - R5</title>
</svelte:head>

<article>
	<header>
		<h1>Following {followings?.length || 0} channels</h1>
		{#if appState?.user}
			<p>Your favorites are synced with your R4 account</p>
		{:else}
			<p>Tip: <a href="/auth?redirect=/following">sign in</a> to sync your followers with R4</p>
		{/if}
	</header>

	{#if followings?.length === 0}
		<p>Channels you follow will appear here.</p>
	{:else}
		<div class="grid">
			{#each followings as following (following.id)}
				<ChannelCard channel={following}>
					{#if following.source === 'v1'}
						<small {@attach tooltip({content: "This v1 channel is saved locally but can't sync to R4"})}
							>v1 • local only</small
						>
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
