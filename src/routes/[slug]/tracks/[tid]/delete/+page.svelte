<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {eq} from '@tanstack/db'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {tracksCollection, deleteTrack} from '$lib/collections/tracks'
	import {channelsCollection} from '$lib/collections/channels'
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
	const canDelete = $derived(canEditChannel(channel?.id))
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
			goto(resolve('/[slug]', {slug: data.slug}))
		} catch (err) {
			error = /** @type {Error} */ (err).message || m.track_delete_failed()
			deleting = false
		}
	}
</script>

<svelte:head>
	<title>{m.common_delete()} {track?.title || m.track_meta_title()}</title>
</svelte:head>

<article class="constrained focused">
	{#if isLoading}
		<p>{m.common_loading()}</p>
	{:else if !track || !channel}
		<p>{m.track_not_found()}</p>
	{:else if canDelete}
		<header>
			<h1>{m.track_delete_heading()}</h1>
			<p>
				<a href={resolve('/[slug]', {slug: channel.slug})}>@{channel.slug}</a> /
				<a href={resolve('/[slug]/tracks/[tid]', {slug: data.slug, tid: data.tid})}>{track.title}</a
				>
			</p>
		</header>

		<p>{m.track_delete_warning()}</p>
		<p>{m.account_delete_irreversible()}</p>

		{#if error}
			<p class="error" role="alert">{m.common_error()}: {error}</p>
		{/if}

		<form class="form" onsubmit={handleDelete}>
			<fieldset>
				<label for="confirm">{m.track_delete_confirm_input({title: track.title})}</label>
				<input id="confirm" type="text" bind:value={confirmTitle} autocomplete="off" />
			</fieldset>

			<button type="submit" disabled={!confirmed || deleting}>
				{deleting ? m.common_deleting() : m.track_delete_button()}
			</button>
		</form>

		<p>
			<a href={resolve('/[slug]/tracks/[tid]/(tabs)/edit', {slug: data.slug, tid: data.tid})}
				>{m.common_cancel()}</a
			>
		</p>
	{:else if !isSignedIn}
		<p><a href={resolve('/auth')}>{m.auth_sign_in_to_edit()}</a></p>
	{:else}
		<p>{m.track_delete_no_permission()}</p>
	{/if}
</article>
