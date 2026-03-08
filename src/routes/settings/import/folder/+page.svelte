<script lang="ts">
	import {goto} from '$app/navigation'
	import {channelsCollection} from '$lib/collections/channels'
	import {appState} from '$lib/app-state.svelte'
	import {uuid} from '$lib/utils'
	import {parseTxtFile, parseM3u, parseTrackTxt, validateBackup, importedSlug, buildFromBackup, writeImport} from '$lib/import'
	import BackLink from '$lib/components/back-link.svelte'
	import type {Channel, Track} from '$lib/types'

	interface FolderImportResult {
		channel: Channel
		imported: number
		source: 'r4download' | 'backup'
	}

	let supported = $state(typeof window !== 'undefined' && 'showDirectoryPicker' in window)
	let scanning = $state(false)
	let results: FolderImportResult[] = $state([])
	let errors: string[] = $state([])
	let done = $state(false)

	async function readFileText(fileHandle: FileSystemFileHandle): Promise<string> {
		const file = await fileHandle.getFile()
		return file.text()
	}

	const AUDIO_EXTENSIONS = new Set(['.m4a', '.mp3', '.ogg', '.flac', '.wav', '.opus'])

	async function importR4Download(
		dirHandle: FileSystemDirectoryHandle,
		dirName: string
	): Promise<FolderImportResult | null> {
		let channelTxtContent: string | null = null
		let m3uContent: string | null = null
		let tracksDir: FileSystemDirectoryHandle | null = null

		for await (const [name, handle] of dirHandle.entries()) {
			if (handle.kind === 'file') {
				if (name.endsWith('.txt') && channelTxtContent === null) {
					channelTxtContent = await readFileText(handle as FileSystemFileHandle)
				}
				if (name === 'tracks.m3u') {
					m3uContent = await readFileText(handle as FileSystemFileHandle)
				}
			} else if (handle.kind === 'directory' && name === 'tracks') {
				tracksDir = handle as FileSystemDirectoryHandle
			}
		}

		// Need at least one of: tracks/ folder or tracks.m3u
		if (!tracksDir && !m3uContent) return null

		const meta = channelTxtContent
			? parseTxtFile(channelTxtContent, dirName)
			: {name: dirName, slug: dirName, description: '', id: uuid()}

		const slug = importedSlug(meta.slug, meta.id)

		// Check for re-import
		const existing = [...channelsCollection.state.values()].find((c) => c.slug === slug)
		if (existing) return {channel: existing, imported: 0, source: 'r4download'}

		const channel: Channel = {
			id: uuid(),
			slug,
			name: meta.name,
			description: meta.description
		} as Channel

		const tracks: Track[] = []

		if (tracksDir) {
			// Collect audio files and their sidecar .txt files
			const audioFiles = new Map<string, FileSystemFileHandle>() // basename → handle
			const txtFiles = new Map<string, FileSystemFileHandle>()   // basename → handle

			for await (const [name, handle] of tracksDir.entries()) {
				if (handle.kind !== 'file') continue
				const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
				const basename = name.slice(0, name.lastIndexOf('.'))
				if (AUDIO_EXTENSIONS.has(ext)) {
					audioFiles.set(basename, handle as FileSystemFileHandle)
				} else if (ext === '.txt') {
					txtFiles.set(basename, handle as FileSystemFileHandle)
				}
			}

			for (const [basename, audioHandle] of audioFiles) {
				const audioFile = await audioHandle.getFile()
				const objectUrl = URL.createObjectURL(audioFile)
				const txtHandle = txtFiles.get(basename)
				let title = basename
				let description = ''
				let originalUrl = ''
				if (txtHandle) {
					const parsed = parseTrackTxt(await readFileText(txtHandle))
					title = parsed.title
					description = parsed.description
					originalUrl = parsed.url
				}
				tracks.push({
					id: uuid(),
					slug,
					title,
					description,
					url: objectUrl,
					media_id: objectUrl,
					provider: 'file',
					// Store original stream URL in description if not already there
					...(originalUrl && !description.includes(originalUrl)
						? {description: description ? `${description}\n${originalUrl}` : originalUrl}
						: {})
				} as Track)
			}
		}

		// Fall back to m3u for any channel with no downloaded files
		if (tracks.length === 0 && m3uContent) {
			const rawTracks = parseM3u(m3uContent)
			for (const t of rawTracks) {
				tracks.push({
					id: uuid(),
					slug,
					title: t.title,
					url: t.url
				} as Track)
			}
		}

		await writeImport(channel, tracks)
		return {channel, imported: tracks.length, source: 'r4download'}
	}

	async function importJsonBackups(
		dirHandle: FileSystemDirectoryHandle,
		jsonHandles: FileSystemFileHandle[]
	): Promise<FolderImportResult[]> {
		const results: FolderImportResult[] = []
		for (const handle of jsonHandles) {
			try {
				const text = await readFileText(handle)
				let data: unknown
				try {
					data = JSON.parse(text)
				} catch {
					errors = [...errors, `${handle.name}: not valid JSON.`]
					continue
				}
				try {
					validateBackup(data)
				} catch (e) {
					errors = [...errors, `${handle.name}: ${(e as Error).message}`]
					continue
				}
				const slug = importedSlug(data.channel.slug, data.channel.id)
				const existing = [...channelsCollection.state.values()].find((c) => c.slug === slug)
				if (existing) {
					results.push({channel: existing, imported: 0, source: 'backup'})
					continue
				}
				const {channel, tracks} = buildFromBackup(data)
				await writeImport(channel, tracks)
				results.push({channel, imported: tracks.length, source: 'backup'})
			} catch (e) {
				errors = [...errors, `${handle.name}: ${(e as Error).message}`]
			}
		}
		return results
	}

	async function scanDir(dirHandle: FileSystemDirectoryHandle, dirName: string): Promise<FolderImportResult[]> {
		const jsonHandles: FileSystemFileHandle[] = []
		let hasM3u = false
		let hasTracksDir = false
		const subdirs: {handle: FileSystemDirectoryHandle; name: string}[] = []

		for await (const [name, handle] of dirHandle.entries()) {
			if (handle.kind === 'file') {
				if (name === 'tracks.m3u') hasM3u = true
				if (name.endsWith('.json')) jsonHandles.push(handle as FileSystemFileHandle)
			} else if (handle.kind === 'directory') {
				if (name === 'tracks') hasTracksDir = true
				subdirs.push({handle: handle as FileSystemDirectoryHandle, name})
			}
		}

		if (hasM3u || hasTracksDir) {
			const r = await importR4Download(dirHandle, dirName)
			return r ? [r] : []
		}

		if (jsonHandles.length > 0) {
			return importJsonBackups(dirHandle, jsonHandles)
		}

		// Scan one level of subdirectories
		const subResults: FolderImportResult[] = []
		for (const {handle, name} of subdirs) {
			const sub = await scanDir(handle, name)
			subResults.push(...sub)
		}
		return subResults
	}

	async function pickFolder() {
		errors = []
		results = []
		done = false
		scanning = true
		try {
			const dirHandle = await window.showDirectoryPicker({mode: 'read'})
			const found = await scanDir(dirHandle, dirHandle.name)
			results = found
			done = true
		} catch (e) {
			if ((e as Error).name !== 'AbortError') {
				errors = [...errors, (e as Error).message]
			}
		} finally {
			scanning = false
		}
	}

	function reset() {
		results = []
		errors = []
		done = false
	}

	function browseImported() {
		appState.channels_filter = 'imported'
		goto('/')
	}
</script>

<svelte:head>
	<title>Import from channel folder</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href="/settings/import" />
		<h1>Import from channel folder</h1>
	</header>

	{#if !supported}
		<p>
			Your browser doesn't support folder access. Try Chrome or Edge, or use
			<a href="/settings/import/backup">import from backup file</a> instead.
		</p>
	{:else}
		<p>
			Pick a folder produced by <code>r4 download &lt;slug&gt;</code>, or a parent folder
			containing multiple channel download folders.
		</p>

		{#if !done}
			<button type="button" onclick={pickFolder} disabled={scanning}>
				{scanning ? 'Scanning…' : 'Choose folder'}
			</button>
		{/if}

		{#if errors.length}
			<ul role="alert">
				{#each errors as err}
					<li>{err}</li>
				{/each}
			</ul>
		{/if}

		{#if done}
			{#if results.length === 0}
				<p>No importable channels found in that folder.</p>
			{:else}
				<ul class="results">
					{#each results as r}
						<li>
							<strong>{r.channel.name}</strong>
							{#if r.imported > 0}
								— {r.imported} tracks imported
							{:else}
								— already imported
							{/if}
							<a href="/{r.channel.slug}">Browse →</a>
						</li>
					{/each}
				</ul>
				<p>
					<button type="button" onclick={browseImported}>Browse all imported →</button>
				</p>
			{/if}
			<p>
				<button type="button" onclick={reset}>Import another</button>
			</p>
		{/if}
	{/if}
</article>

<style>
	.results {
		list-style: none;
		padding: 0;
		margin: 1rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.results li {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
</style>
