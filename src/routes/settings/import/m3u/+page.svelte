<script lang="ts">
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import {importM3uFile, importFromUrl} from '$lib/import'
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
	async function importM3u(file: File) {
		error = ''
		result = null
		importing = true
		try {
			result = await importM3uFile(file)
		} catch (e) {
			error = (e as Error).message
		} finally {
			importing = false
		}
	}

	function onFileChange(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0]
		if (file) importM3u(file)
	}

	function onDrop(event: DragEvent) {
		const file = event.dataTransfer?.files?.[0]
		if (file) importM3u(file)
	}

	function browseImported() {
		appState.channels_filter = 'imported'
		goto('/')
	}
</script>

<svelte:head>
	<title>{m.import_m3u_title()}</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/settings/import')} />
		<h1>{m.import_m3u_title()}</h1>
	</header>

	<p>{m.import_m3u_description()}</p>

	{#if !result}
		<form
			onsubmit={(e) => {
				e.preventDefault()
				importUrl()
			}}
		>
			<input
				type="url"
				bind:value={url}
				placeholder={m.import_m3u_url_placeholder()}
				disabled={importing}
			/>
			<button type="submit" disabled={importing || !url.trim()}>{m.import_from_url()}</button>
		</form>

		<Dropzone ondrop={onDrop}>
			{#if importing}
				{m.import_loading()}
			{:else}
				{m.import_m3u_dropzone()} <span class="browse-link">{m.import_dropzone_browse()}</span>
			{/if}
			<input type="file" accept=".m3u,.m3u8" onchange={onFileChange} disabled={importing} />
		</Dropzone>
	{/if}

	{#if error}
		<p role="alert">{error}</p>
	{/if}

	{#if result}
		<p>
			<strong>{result.channel.name}</strong> — {m.import_result_tracks({count: result.imported})}
			<a href={resolve('/[slug]', {slug: result.channel.slug})}>{m.import_browse_channel()}</a>
		</p>
		<p>
			<button type="button" onclick={browseImported}>{m.import_browse_all()}</button>
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
