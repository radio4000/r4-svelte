<script>
	import {goto} from '$app/navigation'
	import {useAppState} from '$lib/app-state.svelte'

	const appState = $derived(useAppState().data)

	let {data} = $props()

	const channel = $derived(data.channel)
	const isSignedIn = $derived(!!appState?.user)
	const canEdit = $derived(isSignedIn && appState?.channels?.includes(channel?.id))

	let error = $state('')
	let success = $state(false)

	async function handleSubmit(event) {
		error = ''
		success = false

		try {
			const channelData = event.detail.data

			const {error: updateError} = await window.r4sdk.channels.updateChannel(channel.id, channelData)

			if (updateError) {
				throw updateError
			}

			success = true
			setTimeout(() => {
				goto(`/${data.slug}`)
			}, 1500)
		} catch (err) {
			console.error('Failed to update channel:', err)
			error = err.message || 'Failed to update channel'
		}
	}
</script>

<svelte:head>
	<title>Edit {channel?.name} - R5</title>
</svelte:head>

{#if canEdit}
	<h2>
		Edit channel
		{#if channel}
			<a href={`/${channel.slug}`}>{channel.name}</a>
		{/if}
	</h2>

	{#if error}
		<p class="error">Error: {error}</p>
	{/if}

	{#if success}
		<p class="success">Channel updated successfully! Redirecting...</p>
	{:else}
		<r4-channel-update
			channel_id={channel.id}
			name={channel.name}
			description={channel.description}
			url={channel.url}
			image={channel.image}
			onsubmit={handleSubmit}
		></r4-channel-update>
	{/if}
{:else}
	<p><a href="/auth">Sign in to edit this channel</a></p>
{/if}
