<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import {canEditChannel, isLocalChannel} from '$lib/app-state.svelte'
	import {tracksCollection} from '$lib/collections/tracks'
	import {getChannelCtx} from '$lib/contexts'
	import Icon from '$lib/components/icon.svelte'
	import ChannelNavControlsPortal from '$lib/components/channel-nav-controls-portal.svelte'
	import * as m from '$lib/paraglide/messages'

	const channelCtx = getChannelCtx()
	const slug = $derived(page.params.slug)
	const channel = $derived(channelCtx.data)
	const canEdit = $derived(canEditChannel(channel?.id) || isLocalChannel(channel?.id))

	let error = $state('')
	let success = $state(false)
	let showRaw = $state(false)

	const backupData = $derived.by(() => {
		if (!channel) return null
		void tracksCollection.state.size
		const tracks = [...tracksCollection.state.values()].filter((t) => t.slug === slug)
		return {channel, tracks}
	})

	function downloadBackup() {
		error = ''
		success = false
		try {
			if (!channel) throw new Error(m.channel_not_found())
			const data = backupData
			const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})
			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = `radio4000-${slug}-${new Date().toISOString().slice(0, 10)}.json`
			a.click()
			URL.revokeObjectURL(url)
			success = true
		} catch (e) {
			error = /** @type {Error} */ (e).message
		}
	}
</script>

<svelte:head>
	<title>{m.channel_backup_page_title({handle: `@${slug}`})}</title>
</svelte:head>

<ChannelNavControlsPortal controls={navControls} />

{#snippet navControls()}
	{#if canEdit}
		<button type="button" onclick={downloadBackup}>
			<Icon icon="document-download" />
			{m.channel_backup_download()}
		</button>
		<button
			type="button"
			onclick={() => (showRaw = !showRaw)}
			title={showRaw ? m.track_meta_toggle_formatted() : m.track_meta_toggle_raw()}
			aria-label={showRaw ? m.track_meta_toggle_formatted() : m.track_meta_toggle_raw()}
		>
			<Icon icon="code" />
		</button>
	{/if}
{/snippet}

<article class="constrained">
	{#if canEdit}
		<p>{m.channel_backup_description()}</p>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		{#if success}
			<p class="success">{m.channel_backup_success()}</p>
		{/if}
	{:else}
		<p><a href={resolve('/auth')}>{m.channel_backup_sign_in()}</a></p>
	{/if}
	{#if showRaw && backupData}
		<pre><code>{JSON.stringify(backupData, null, 2)}</code></pre>
	{/if}
</article>
