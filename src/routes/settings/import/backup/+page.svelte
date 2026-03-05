<script lang="ts">
	import {channelsCollection} from '$lib/collections/channels'
	import {tracksCollection} from '$lib/collections/tracks'
	import {queryClient} from '$lib/collections/query-client'
	import BackLink from '$lib/components/back-link.svelte'
	import type {Channel, Track} from '$lib/types'

	interface BackupData {
		channel: Channel
		tracks: Track[]
	}

	interface ImportResult {
		channel: Channel
		imported: number
		skipped: number
	}

	let error = $state('')
	let result: ImportResult | null = $state(null)

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

		const date = new Date().toISOString().slice(0, 10)
		const importedSlug = `${data.channel.slug}-import-${date}`

		const channel: Channel = {...data.channel, slug: importedSlug}
		const tracks: Track[] = data.tracks.map((t) => ({...t, slug: importedSlug}))

		if (!channelsCollection.get(channel.id)) {
			channelsCollection.utils.writeUpsert(channel)
			// Seed query cache so useLiveQuery doesn't trigger a remote fetch for this slug
			queryClient.setQueryData(['channels', channel.slug], [channel])
		}

		if (!tracksCollection.isReady()) {
			tracksCollection.startSyncImmediate()
		}

		let imported = 0
		let skipped = 0
		const tracksToCache: Track[] = []
		tracksCollection.utils.writeBatch(() => {
			for (const t of tracks) {
				if (!tracksCollection.get(t.id)) {
					tracksCollection.utils.writeUpsert(t)
					tracksToCache.push(t)
					imported++
				} else {
					skipped++
				}
			}
		})
		// Seed query cache so useLiveQuery doesn't trigger a remote fetch for this slug
		if (tracksToCache.length) {
			queryClient.setQueryData(['tracks', importedSlug], tracksToCache)
		}

		result = {channel, imported, skipped}
	}

	function onFileChange(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0]
		if (file) importBackup(file)
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
		Load a Radio4000 backup to browse it — no account needed. Any JSON with a <code>channel</code>
		and <code>tracks</code> array works, not just exports from this app. Bring your own data.
	</p>

	{#if !result}
		<p>
			<label>
				Choose a JSON file
				<input type="file" accept=".json,application/json" onchange={onFileChange} />
			</label>
		</p>
	{/if}

	{#if error}
		<p role="alert">{error}</p>
	{/if}

	{#if result}
		<p>
			{result.imported} tracks imported into
			<a href="/{result.channel.slug}">@{result.channel.slug}</a>.{#if result.skipped > 0}
				{result.skipped} already present, left as-is.{/if}
		</p>
		<p>
			<a href="/{result.channel.slug}">Browse @{result.channel.slug} →</a>
		</p>
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
	label {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
</style>
