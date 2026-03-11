<script lang="ts">
	import {resolve} from '$app/paths'
	import {importBackupFile, importFromUrl} from '$lib/import'
	import type {ImportResult} from '$lib/import'
	import BackLink from '$lib/components/back-link.svelte'
	import Dropzone from '$lib/components/dropzone.svelte'
	import * as m from '$lib/paraglide/messages'

	let error = $state('')
	let importing = $state(false)
	let result: ImportResult | null = $state(null)
	let url = $state('')

	async function importUrl() {
		if (!url.trim()) return
		error = ''
		result = null
		importing = true
		try {
			result = await importFromUrl(url.trim())
		} catch (e) {
			error = (e as Error).message
		} finally {
			importing = false
		}
	}
	async function importBackup(file: File) {
		error = ''
		result = null
		importing = true
		try {
			result = await importBackupFile(file)
		} catch (e) {
			error = (e as Error).message
		} finally {
			importing = false
		}
	}

	function onFileChange(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0]
		if (file) importBackup(file)
	}

	function onDrop(event: DragEvent) {
		const file = event.dataTransfer?.files?.[0]
		if (file) importBackup(file)
	}
</script>

<svelte:head>
	<title>{m.import_backup_title()}</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/settings/import')} />
		<h1>{m.import_backup_title()}</h1>
	</header>

	<p>{m.import_backup_description()}</p>

	{#if !result}
		<form
			onsubmit={(e) => {
				e.preventDefault()
				importUrl()
			}}
		>
			<input type="url" bind:value={url} placeholder="https://…  (.json, .txt, .m3u)" disabled={importing} />
			<button type="submit" disabled={importing || !url.trim()}>Import from URL</button>
		</form>

		<Dropzone ondrop={onDrop}>
			{#if importing}
				{m.import_loading()}
			{:else}
				{m.import_backup_dropzone()} <span class="browse-link">{m.import_dropzone_browse()}</span>
			{/if}
			<input type="file" accept=".json,application/json" onchange={onFileChange} disabled={importing} />
		</Dropzone>
	{/if}

	{#if error}
		<p role="alert">{error}</p>
	{/if}

	{#if result}
		{#if result.alreadyImported}
			<p>
				<strong>{result.channel.name}</strong> — {m.import_result_already()}
				<a href={resolve('/[slug]', {slug: result.channel.slug})}>{m.import_browse_channel()}</a>
			</p>
		{:else}
			<p>
				<strong>{result.channel.name}</strong> — {m.import_result_tracks({count: result.imported})}
				<a href={resolve('/[slug]', {slug: result.channel.slug})}>{m.import_browse_channel()}</a>
			</p>
		{/if}
		<p>
			<button
				type="button"
				onclick={() => {
					result = null
					error = ''
				}}>{m.import_another()}</button
			>
		</p>
	{/if}
</article>

<style>
	form {
		display: flex;
		gap: 0.5rem;
		input {
			flex: 1;
		}
	}
</style>
