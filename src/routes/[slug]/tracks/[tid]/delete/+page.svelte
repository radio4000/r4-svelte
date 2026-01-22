<script>
	import {goto} from '$app/navigation'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {eq} from '@tanstack/db'
	import {appState} from '$lib/app-state.svelte'
	import {tracksCollection, channelsCollection, deleteTrack} from '$lib/tanstack/collections'
	import * as m from '$lib/paraglide/messages'

	let {data} = $props()

	const tracksQuery = useLiveQuery((q) =>
		q
			.from({tracks: tracksCollection})
			.where(({tracks}) => eq(tracks.slug, data.slug))
			.orderBy(({tracks}) => tracks.created_at)
	)

	const channelQuery = useLiveQuery((q) =>
		q
			.from({channels: channelsCollection})
			.where(({channels}) => eq(channels.slug, data.slug))
			.orderBy(({channels}) => channels.created_at)
			.limit(1)
	)

	const track = $derived(tracksQuery.data?.find((t) => t.id === data.tid))
	const channel = $derived(channelQuery.data?.[0])
	const isSignedIn = $derived(!!appState.user)
	const canDelete = $derived(isSignedIn && appState.channels?.includes(channel?.id))
	const isLoading = $derived(tracksQuery.isLoading || channelQuery.isLoading)

	let error = $state('')
	let deleting = $state(false)
	let confirmTitle = $state('')

	const confirmed = $derived(confirmTitle === track?.title)

	async function handleDelete(event) {
		event.preventDefault()
		if (!track || !channel || !confirmed || deleting) return

		error = ''
		deleting = true

		try {
			await deleteTrack({id: channel.id, slug: channel.slug}, track.id)
			goto(`/${data.slug}`)
		} catch (err) {
			error = /** @type {Error} */ (err).message || 'Failed to delete track'
			deleting = false
		}
	}
</script>

<svelte:head>
	<title>{m.common_delete()} {track?.title || m.track_meta_title()}</title>
</svelte:head>

<article class="constrained focused">
	{#if isLoading}
		<p>Loading...</p>
	{:else if !track || !channel}
		<p>Track not found</p>
	{:else if canDelete}
		<header>
			<h1>{m.common_delete()} track</h1>
			<p><a href="/{channel.slug}">@{channel.slug}</a> / <a href="/{data.slug}/tracks/{data.tid}">{track.title}</a></p>
		</header>

		<p>This will permanently delete this track.</p>
		<p>This cannot be undone.</p>

		{#if error}
			<p class="error" role="alert">{m.common_error()}: {error}</p>
		{/if}

		<form class="form" onsubmit={handleDelete}>
			<fieldset>
				<legend><label for="confirm">Type <code>{track.title}</code> to confirm</label></legend>
				<input id="confirm" type="text" bind:value={confirmTitle} autocomplete="off" />
			</fieldset>

			<button type="submit" disabled={!confirmed || deleting}>
				{deleting ? 'Deleting...' : 'Delete track'}
			</button>
		</form>

		<p><a href="/{data.slug}/tracks/{data.tid}/edit">Cancel</a></p>
	{:else if !isSignedIn}
		<p><a href="/auth">{m.auth_sign_in_to_edit()}</a></p>
	{:else}
		<p>You don't have permission to delete this track.</p>
	{/if}
</article>
