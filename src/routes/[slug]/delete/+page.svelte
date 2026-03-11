<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {getChannelCtx} from '$lib/contexts'
	import {appState, canEditChannel, isLocalChannel} from '$lib/app-state.svelte'
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
			error = /** @type {Error} */ (err).message || 'Failed to delete channel'
			deleting = false
		}
	}
</script>

<svelte:head>
	<title>Delete {channel?.name || 'channel'}</title>
</svelte:head>

<article class="constrained focused">
	{#if canDelete && channel}
		<header>
			<h1>Delete <a href={resolve('/[slug]', {slug: channel.slug})}>{channel.name}</a></h1>
		</header>

		{#if isLocal}
			<p>
				This will remove <strong>{channel.name}</strong> and its {trackCount} tracks from your browser. This is local data
				only — nothing will be deleted from Radio4000.
			</p>
		{:else}
			<p>
				This will permanently delete the channel and its {trackCount} tracks from Radio4000. This cannot be undone.
			</p>
		{/if}

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<form class="form" onsubmit={handleDelete}>
			{#if !isLocal}
				<fieldset>
					<label for="confirm">Type <code>{channel.slug}</code> to confirm</label>
					<input id="confirm" type="text" bind:value={confirmSlug} autocomplete="off" />
				</fieldset>
			{/if}

			<button type="submit" disabled={(!isLocal && !confirmed) || deleting}>
				{deleting ? m.common_deleting() : m.channel_delete_button()}
			</button>
		</form>

		<p><a href={resolve('/[slug]', {slug: channel.slug})}>Cancel</a></p>
	{:else if !isSignedIn && !isLocal}
		<p><a href={resolve('/auth')}>Sign in</a></p>
	{:else}
		<p>Loading…</p>
	{/if}
</article>

<style>
	article {
		gap: 1rem;
	}
</style>
