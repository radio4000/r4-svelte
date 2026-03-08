<script lang="ts">
	import {goto} from '$app/navigation'
	import {channelsCollection} from '$lib/collections/channels'
	import {appState} from '$lib/app-state.svelte'
	import {validateBackup, importedSlug, buildFromBackup, writeImport} from '$lib/import'
	import type {ImportResult} from '$lib/import'
	import BackLink from '$lib/components/back-link.svelte'

	let error = $state('')
	let importing = $state(false)
	let result: ImportResult | null = $state(null)
	let dragOver = $state(false)

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
				error = 'Not valid JSON.'
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
		dragOver = false
		event.preventDefault()
		const file = event.dataTransfer?.files?.[0]
		if (file) importBackup(file)
	}

	function browseImported() {
		appState.channels_filter = 'imported'
		goto('/')
	}
</script>

<svelte:head>
	<title>Import backup</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href="/settings/import" />
		<h1>Import channel data</h1>
	</header>

	<p>
		Load a Radio4000 backup to browse it locally — no account needed. Any JSON with a
		<code>channel</code> and <code>tracks</code> array works.
	</p>

	{#if previouslyImported.length}
		<p>
			{previouslyImported.length}
			{previouslyImported.length === 1 ? 'channel' : 'channels'} already imported.
			<button type="button" onclick={browseImported}>Browse them →</button>
		</p>
	{/if}

	{#if !result}
		<label
			class="dropzone"
			class:drag-over={dragOver}
			ondragover={(e) => {
				e.preventDefault()
				dragOver = true
			}}
			ondragleave={() => (dragOver = false)}
			ondrop={onDrop}
		>
			{#if importing}
				Importing…
			{:else}
				Drop a JSON file here, or <span class="browse-link">browse</span>
			{/if}
			<input
				type="file"
				accept=".json,application/json"
				onchange={onFileChange}
				disabled={importing}
			/>
		</label>
	{/if}

	{#if error}
		<p role="alert">{error}</p>
	{/if}

	{#if result}
		{#if result.alreadyImported}
			<p>
				<strong>{result.channel.name}</strong> is already imported.
				<a href="/{result.channel.slug}">Browse it →</a>
			</p>
		{:else}
			<p>
				<strong>{result.channel.name}</strong> — {result.imported} tracks imported.
				<a href="/{result.channel.slug}">Browse it →</a>
			</p>
		{/if}
		<p>
			<button
				type="button"
				onclick={() => {
					result = null
					error = ''
				}}>Import another</button
			>
		</p>
	{/if}
</article>

<style>
	.dropzone {
		border: 2px dashed var(--gray-6);
		border-radius: 0.5rem;
		padding: 2rem;
		text-align: center;
		transition: border-color 0.15s, background 0.15s;
		cursor: pointer;
		&:hover,
		&.drag-over {
			border-color: var(--accent-9);
			background: var(--accent-2);
		}
	}

	input[type='file'] {
		display: none;
	}

	.browse-link {
		text-decoration: underline;
	}
</style>
