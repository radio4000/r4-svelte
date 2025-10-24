<script>
	import {page} from '$app/stores'
	import {useAppState} from '$lib/app-state.svelte'
	import {pg} from '$lib/r5/db'

	const appState = $derived(useAppState().data)

	const slug = $derived(page.params.slug)

	const channel = $derived.by(async () => {
		const result = await pg.sql`select * from channels where slug = ${slug}`
		return result.rows[0]
	})

	const isOwner = $derived.by(async () => {
		const channelData = await channel
		return channelData && appState?.channels?.includes(channelData.id)
	})
</script>

<svelte:head>
	{#await channel then channelData}
		<title>Update {channelData?.name || slug} - R5</title>
	{/await}
</svelte:head>

{#await Promise.all([channel, isOwner]) then [channelData, ownerCheck]}
	{#if !channelData}
		<p>Channel not found</p>
	{:else if !ownerCheck}
		<p>You can only update your own channels</p>
	{:else}
		<h1>Update {channelData.name}</h1>
		<r4-channel-update channel-id={channelData.id}></r4-channel-update>
	{/if}
{/await}
