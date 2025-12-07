<script>
	import {goto} from '$app/navigation'
	import {useLiveQuery, eq} from '@tanstack/svelte-db'
	import {appState} from '$lib/app-state.svelte'
	import {channelsCollection} from '../../tanstack/collections'
	import * as m from '$lib/paraglide/messages'

	let {data} = $props()

	const channelQuery = useLiveQuery((q) =>
		q
			.from({channels: channelsCollection})
			.where(({channels}) => eq(channels.slug, data.slug))
			.orderBy(({channels}) => channels.created_at)
			.limit(1)
	)

	const channel = $derived(channelQuery.data?.[0])
	const isSignedIn = $derived(!!appState.user)
	const canEdit = $derived(isSignedIn && appState.channels?.includes(channel?.id))

	let error = $state('')
	let success = $state(false)

	async function handleSubmit(event) {
		error = ''
		success = false

		try {
			const channelData = event.detail.data

			const {error: updateError} = await /** @type {any} */ (window).r4sdk.channels.updateChannel(
				channel.id,
				channelData
			)

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
	<title>{m.channel_edit_page_title({name: channel?.name || m.channel_page_fallback()})}</title>
</svelte:head>

{#if canEdit}
	<h2>
		{m.channel_edit_title()}
		{#if channel}
			<a href={`/${channel.slug}`}>{channel.name}</a>
		{/if}
	</h2>

	{#if error}
		<p class="error">{m.common_error()}: {error}</p>
	{/if}

	{#if success}
		<p class="success">{m.channel_updated_success()}</p>
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
	<p><a href="/auth">{m.auth_sign_in_to_edit()}</a></p>
{/if}
