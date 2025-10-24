<script>
	import {goto} from '$app/navigation'
	import {useAppState} from '$lib/app-state.svelte'
	import {r5} from '$lib/r5'

	const appState = useAppState()
	let userChannelSlug = $state(null)

	$effect(async () => {
		if (appState?.channels?.length > 0) {
			const channelId = appState.channels[0]
			try {
				const channels = await r5.channels.local()
				const userChannel = channels.find((c) => c.id === channelId)
				userChannelSlug = userChannel?.slug
			} catch (err) {
				console.warn('Failed to get user channel:', err)
			}
		}
	})

	function handleSubmit(event) {
		const {slug} = event.detail
		if (slug) goto(`/${slug}`)
	}
</script>

<article class="MiniContainer">
	{#if !appState?.user}
		<p><a href="/auth?redirect=/create-channel">Sign in</a> to create a channel</p>
	{:else if appState?.channels?.length > 0}
		<p>You have a channel: <a href="/{userChannelSlug}">{userChannelSlug}</a></p>
	{:else}
		<header>
			<p>What do you want to name your Radio4000 channel? <small>(can be changed anytime)</small></p>
		</header>
		<br />
		<r4-channel-create onsubmit={handleSubmit}></r4-channel-create>
	{/if}
</article>
