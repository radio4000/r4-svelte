<script lang="ts">
	import {goto} from '$app/navigation'
	import {channelsCollection} from '$lib/collections/channels'
	import {appState} from '$lib/app-state.svelte'
	import {validateBackup, importedSlug, buildFromBackup, writeImport} from '$lib/import'
	import type {ImportResult} from '$lib/import'
	import BackLink from '$lib/components/back-link.svelte'
	import Dropzone from '$lib/components/dropzone.svelte'
	import * as m from '$lib/paraglide/messages'

	let error = $state('')
	let importing = $state(false)
	let result: ImportResult | null = $state(null)
	const previouslyImported = $derived(
		appState.local_channel_ids?.length
			? appState.local_channel_ids
					.map((id) => channelsCollection.get(id))
					.filter((c) => c !== undefined)
			: []
	)

	async function importBackup(file: File) {
		error = ''
		result = null
		importing = true

		try {
			let data: unknown
			try {
				data = JSON.parse(await file.text())
			} catch {
				error = m.import_error_invalid_json()
				return
			}

			try {
				validateBackup(data)
			} catch (e) {
				error = (e as Error).message
				return
			}

			const slug = importedSlug(data.channel.slug, data.channel.id)
			const existing = [...channelsCollection.state.values()].find((c) => c.slug === slug)
			if (existing) {
				result = {channel: existing, imported: 0, alreadyImported: true}
				return
			}

			const {channel, tracks} = buildFromBackup(data)
			await writeImport(channel, tracks)
			result = {channel, imported: tracks.length}
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

	function browseImported() {
		appState.channels_filter = 'imported'
		goto('/')
	}
</script>

<svelte:head>
	<title>{m.import_backup_title()}</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href="/settings/import" />
		<h1>{m.import_backup_title()}</h1>
	</header>

	<p>{m.import_backup_description()}</p>

	{#if previouslyImported.length}
		<p>
			{m.import_previously_imported({count: previouslyImported.length})}
			<button type="button" onclick={browseImported}>{m.import_browse_imported()}</button>
		</p>
	{/if}

	{#if !result}
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
				<a href="/{result.channel.slug}">{m.import_browse_channel()}</a>
			</p>
		{:else}
			<p>
				<strong>{result.channel.name}</strong> — {m.import_result_tracks({count: result.imported})}
				<a href="/{result.channel.slug}">{m.import_browse_channel()}</a>
			</p>
		{/if}
		<p>
			<button type="button" onclick={() => { result = null; error = '' }}>{m.import_another()}</button>
		</p>
	{/if}
</article>

