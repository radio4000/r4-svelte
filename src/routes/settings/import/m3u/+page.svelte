<script lang="ts">
	import {goto} from '$app/navigation'
	import {appState} from '$lib/app-state.svelte'
	import {uuid} from '$lib/utils'
	import {parseM3u, writeImport} from '$lib/import'
	import BackLink from '$lib/components/back-link.svelte'
	import type {Channel, Track} from '$lib/types'

	interface ImportResult {
		channel: Channel
		imported: number
	}

	let error = $state('')
	let importing = $state(false)
	let result: ImportResult | null = $state(null)
	let dragOver = $state(false)

	async function importM3u(file: File) {
		error = ''
		result = null
		importing = true

		try {
			const content = await file.text()
			const rawTracks = parseM3u(content)

			if (!rawTracks.length) {
				error = 'No playable tracks found. Only http(s) URLs are supported.'
				return
			}

			// Derive a slug from the filename (strip extension, sanitize)
			const baseName = file.name.replace(/\.m3u8?$/i, '')
			const baseSlug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'playlist'
			const channelId = uuid()
			const slug = `${baseSlug}-import-${channelId.slice(0, 8)}`

			const channel: Channel = {
				id: channelId,
				slug,
				name: baseName,
				description: ''
			} as Channel

			const tracks: Track[] = rawTracks.map((t) => ({
				id: uuid(),
				slug,
				title: t.title,
				url: t.url
			} as Track))

			await writeImport(channel, tracks)
			result = {channel, imported: tracks.length}
		} finally {
			importing = false
		}
	}

	function onFileChange(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0]
		if (file) importM3u(file)
	}

	function onDrop(event: DragEvent) {
		dragOver = false
		event.preventDefault()
		const file = event.dataTransfer?.files?.[0]
		if (file) importM3u(file)
	}

	function browseImported() {
		appState.channels_filter = 'imported'
		goto('/')
	}
</script>

<svelte:head>
	<title>Import M3U playlist</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href="/settings/import" />
		<h1>Import M3U playlist</h1>
	</header>

	<p>Load a <code>.m3u</code> playlist to browse it locally. Only http(s) tracks are imported — local file paths are skipped.</p>

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
				Drop a .m3u file here, or <span class="browse-link">browse</span>
			{/if}
			<input
				type="file"
				accept=".m3u,.m3u8"
				onchange={onFileChange}
				disabled={importing}
			/>
		</label>
	{/if}

	{#if error}
		<p role="alert">{error}</p>
	{/if}

	{#if result}
		<p>
			<strong>{result.channel.name}</strong> — {result.imported} tracks imported.
			<a href="/{result.channel.slug}">Browse it →</a>
		</p>
		<p>
			<button type="button" onclick={browseImported}>Browse all imported →</button>
			<button type="button" onclick={() => { result = null; error = '' }}>Import another</button>
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
