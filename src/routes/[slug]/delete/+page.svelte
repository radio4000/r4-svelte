<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {getChannelCtx} from '$lib/contexts'
	import {appState, canEditChannel, isLocalChannel} from '$lib/app-state.svelte'
	import {appName} from '$lib/config'
	import {deleteChannel} from '$lib/collections/channels'
	import {channelsCollection} from '$lib/collections/channels'
	import {tracksCollection} from '$lib/collections/tracks'
	import {queryClient} from '$lib/collections/query-client'
	import * as m from '$lib/paraglide/messages'

	const channelCtx = getChannelCtx()
	const channel = $derived(channelCtx.data)
	const isSignedIn = $derived(!!appState.user)
	const isLocal = $derived(isLocalChannel(channel?.id))
	const canDelete = $derived(canEditChannel(channel?.id) || isLocal)
	const trackCount = $derived(
		isLocal
			? [...tracksCollection.state.values()].filter((t) => t?.slug === channel?.slug).length
			: (channel?.track_count ?? 0)
	)

	let error = $state('')
	let deleting = $state(false)
	let confirmSlug = $state('')

	const confirmed = $derived(confirmSlug === channel?.slug)

	async function handleDelete(event) {
		event.preventDefault()
		if (!channel || deleting) return
		if (!isLocal && !confirmed) return

		error = ''
		deleting = true

		try {
			if (isLocal) {
				// Snapshot before any state changes
				const channelId = channel.id
				const channelSlug = channel.slug
				const channelTracks = [...tracksCollection.state.values()].filter((t) => t?.slug === channelSlug)
				const trackIds = channelTracks.map((t) => t.id)

				// Remove from local_channel_ids first so queryFn won't restore the channel
				appState.local_channel_ids = (appState.local_channel_ids ?? []).filter((id) => id !== channelId)

				// Navigate away first to avoid layout flashing "Channel not found"
				await goto('/')

				// Revoke any blob URLs created for local audio files
				for (const t of channelTracks) {
					if (t?.url?.startsWith('blob:')) URL.revokeObjectURL(t.url)
				}

				// Clean up collections after navigation
				tracksCollection.utils.writeBatch(() => {
					for (const id of trackIds) tracksCollection.utils.writeDelete(id)
				})
				channelsCollection.utils.writeDelete(channelId)
				queryClient.removeQueries({queryKey: ['tracks', channelSlug]})
				queryClient.removeQueries({queryKey: ['channels', channelSlug]})
			} else {
				await deleteChannel(channel.id)
				goto('/')
			}
		} catch (err) {
			error = /** @type {Error} */ (err).message || m.channel_delete_failed()
			deleting = false
		}
	}
</script>

<svelte:head>
	<title>{m.channel_delete_page_title({name: channel?.name || m.channel_page_fallback()})}</title>
</svelte:head>

<article class="constrained focused">
	{#if canDelete && channel}
		<header>
			<h1>{m.channel_delete_heading()} <a href={resolve('/[slug]', {slug: channel.slug})}>{channel.name}</a></h1>
		</header>

		{#if isLocal}
			<p>{m.channel_delete_local_warning({name: channel.name, count: trackCount, appName})}</p>
		{:else}
			<p>{m.channel_delete_remote_warning({count: trackCount, appName})}</p>
		{/if}

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<form class="form" onsubmit={handleDelete}>
			{#if !isLocal}
				<fieldset>
					<label for="confirm">{m.channel_delete_confirm_slug({slug: channel.slug})}</label>
					<input id="confirm" type="text" bind:value={confirmSlug} autocomplete="off" />
				</fieldset>
			{/if}

			<button type="submit" disabled={(!isLocal && !confirmed) || deleting}>
				{deleting ? m.common_deleting() : m.channel_delete_button()}
			</button>
		</form>

		<p><a href={resolve('/[slug]', {slug: channel.slug})}>{m.common_cancel()}</a></p>
	{:else if !isSignedIn && !isLocal}
		<p><a href={resolve('/auth')}>{m.auth_log_in()}</a></p>
	{:else}
		<p>{m.common_loading()}</p>
	{/if}
</article>

<style>
	article {
		gap: 1rem;
	}
</style>
