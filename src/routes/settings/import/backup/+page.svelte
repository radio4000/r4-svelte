<script lang="ts">
	import {goto} from '$app/navigation'
	import {channelsCollection} from '$lib/collections/channels'
	import {tracksCollection} from '$lib/collections/tracks'
	import {queryClient} from '$lib/collections/query-client'
	import {appState} from '$lib/app-state.svelte'
	import {uuid} from '$lib/utils'
	import BackLink from '$lib/components/back-link.svelte'
	import type {Channel, Track} from '$lib/types'

	interface BackupData {
		channel: Channel
		tracks: Track[]
	}

	interface ImportResult {
		channel: Channel
		imported: number
		alreadyImported?: boolean
	}

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

	function validate(data: unknown): asserts data is BackupData {
		if (!data || typeof data !== 'object') throw new Error('Not a valid JSON object.')
		const d = data as Record<string, unknown>
		if (!d.channel || typeof d.channel !== 'object') throw new Error('Missing channel.')
		const ch = d.channel as Record<string, unknown>
		if (!ch.id) throw new Error('Missing channel.id.')
		if (!ch.slug) throw new Error('Missing channel.slug.')
		if (!ch.name) throw new Error('Missing channel.name.')
		if (!Array.isArray(d.tracks)) throw new Error('Missing tracks array.')
		for (let i = 0; i < d.tracks.length; i++) {
			const t = d.tracks[i]
			if (!t?.id) throw new Error(`Track ${i}: missing id.`)
			if (!t?.slug) throw new Error(`Track ${i}: missing slug.`)
			if (!t?.title) throw new Error(`Track ${i}: missing title.`)
			if (!t?.url) throw new Error(`Track ${i}: missing url.`)
		}
	}

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
				validate(data)
			} catch (e) {
				error = (e as Error).message
				return
			}

			const importedSlug = `${data.channel.slug}-import-${data.channel.id.slice(0, 8)}`

			await Promise.all([
				channelsCollection.isReady() ? Promise.resolve() : channelsCollection.preload(),
				tracksCollection.isReady() ? Promise.resolve() : tracksCollection.preload()
			])

			// Detect re-import: same file already loaded this session
			const existingChannel = [...channelsCollection.state.values()].find(
				(c) => c.slug === importedSlug
			)
			if (existingChannel) {
				result = {channel: existingChannel, imported: 0, alreadyImported: true}
				return
			}

			const channelId = uuid()
			const channel: Channel = {...data.channel, id: channelId, slug: importedSlug}
			const tracks: Track[] = data.tracks.map((t) => ({...t, id: uuid(), slug: importedSlug}))

			channelsCollection.utils.writeUpsert(channel)
			queryClient.setQueryData(['channels', channel.slug], [channel])

			const tracksToCache: Track[] = []
			tracksCollection.utils.writeBatch(() => {
				for (const t of tracks) {
					tracksCollection.utils.writeUpsert(t)
					tracksToCache.push(t)
				}
			})
			queryClient.setQueryData(['tracks', importedSlug], tracksToCache)

			if (!appState.local_channel_ids?.includes(channel.id)) {
				appState.local_channel_ids = [...(appState.local_channel_ids ?? []), channel.id]
			}

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
		<BackLink href="/settings" />
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
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="dropzone"
			class:drag-over={dragOver}
			ondragover={(e) => {
				e.preventDefault()
				dragOver = true
			}}
			ondragleave={() => (dragOver = false)}
			ondrop={onDrop}
		>
			<label>
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
		</div>
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
	header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-block: 1rem;
	}
	h1 {
		margin: 0;
	}

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

	label {
		cursor: pointer;
		display: block;
	}

	input[type='file'] {
		display: none;
	}

	.browse-link {
		text-decoration: underline;
	}
</style>
