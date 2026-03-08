<script lang="ts">
	import {goto} from '$app/navigation'
	import {appState} from '$lib/app-state.svelte'
	import {uuid} from '$lib/utils'
	import {parseM3u, writeImport} from '$lib/import'
	import BackLink from '$lib/components/back-link.svelte'
	import Dropzone from '$lib/components/dropzone.svelte'
	import * as m from '$lib/paraglide/messages'
	import type {Channel, Track} from '$lib/types'

	interface ImportResult {
		channel: Channel
		imported: number
	}

	let error = $state('')
	let importing = $state(false)
	let result: ImportResult | null = $state(null)
	async function importM3u(file: File) {
		error = ''
		result = null
		importing = true

		try {
			const content = await file.text()
			const rawTracks = parseM3u(content)

			if (!rawTracks.length) {
				error = m.import_m3u_error_no_tracks()
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
		<BackLink href="/settings/import" />
		<h1>{m.import_m3u_title()}</h1>
	</header>

	<p>{m.import_m3u_description()}</p>

	{#if !result}
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
			<a href="/{result.channel.slug}">{m.import_browse_channel()}</a>
		</p>
		<p>
			<button type="button" onclick={browseImported}>{m.import_browse_all()}</button>
			<button type="button" onclick={() => { result = null; error = '' }}>{m.import_another()}</button>
		</p>
	{/if}
</article>

