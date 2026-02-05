<script>
	import {page} from '$app/state'
	import {canEditChannel} from '$lib/app-state.svelte'
	import {channelsCollection} from '$lib/tanstack/collections'
	import Icon from '$lib/components/icon.svelte'

	const slug = $derived(page.params.slug)
	const channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))
	const canEdit = $derived(canEditChannel(channel?.id))

	let downloading = $state(false)
	let error = $state('')
	let success = $state(false)

	async function downloadBackup() {
		downloading = true
		error = ''
		success = false
		try {
			const res = await fetch(`https://api.radio4000.com/api/v2/backup?slug=${slug}`)
			if (!res.ok) throw new Error('Failed to fetch backup')
			const data = await res.json()
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
		} finally {
			downloading = false
		}
	}
</script>

<svelte:head>
	<title>Backup @{slug}</title>
</svelte:head>

<article class="constrained">
	{#if canEdit}
		<header>
			<h1>Backup</h1>
		</header>

		<p>Download a backup of your channel and all tracks as JSON.</p>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		{#if success}
			<p class="success">Backup downloaded.</p>
		{/if}

		<p>
			<button type="button" onclick={downloadBackup} disabled={downloading}>
				<Icon icon="document-download" size={16} />
				{downloading ? 'Downloading...' : 'Download backup'}
			</button>
		</p>
	{:else}
		<p><a href="/auth">Sign in to access backup</a></p>
	{/if}
</article>
