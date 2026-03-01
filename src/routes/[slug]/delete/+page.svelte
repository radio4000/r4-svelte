<script>
	import {goto} from '$app/navigation'
	import {getChannelCtx} from '$lib/contexts'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {deleteChannel} from '$lib/collections/channels'
	import * as m from '$lib/paraglide/messages'

	const channelCtx = getChannelCtx()
	const channel = $derived(channelCtx.data)
	const isSignedIn = $derived(!!appState.user)
	const canDelete = $derived(canEditChannel(channel?.id))

	let error = $state('')
	let deleting = $state(false)
	let confirmSlug = $state('')

	const confirmed = $derived(confirmSlug === channel?.slug)

	async function handleDelete(event) {
		if (!channel || !confirmed || deleting) return

		event.preventDefault()

		error = ''
		deleting = true

		try {
			console.log('dryrun would try to delete', channel)
			const x = await deleteChannel(channel.id)
			console.log(x)
			goto('/')
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
			<h1>Delete <a href={`/${channel.slug}`}>{channel.name}</a></h1>
		</header>

		<p>
			This will permanently delete the channel,<br />
			AND any {#if channel.track_count}({channel.track_count}){/if} tracks you have added.
		</p>

		<p>This cannot be undone.</p>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<form class="form" onsubmit={handleDelete}>
			<fieldset>
				<label for="confirm">Type <code>{channel.slug}</code> to confirm</label>
				<input id="confirm" type="text" bind:value={confirmSlug} autocomplete="off" />
			</fieldset>

			<button type="submit" disabled={!confirmed || deleting}>
				{deleting ? m.common_deleting() : m.channel_delete_button()}
			</button>
		</form>

		<p><a href={`/${channel.slug}/edit`}>Cancel</a></p>
	{:else if !isSignedIn}
		<p><a href="/auth">Sign in</a></p>
	{:else}
		<p>Loading...</p>
	{/if}
</article>

<style>
	article {
		gap: 1rem;
	}
</style>
