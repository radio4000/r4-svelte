<script lang="ts">
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {channelsCollection} from '$lib/collections/channels'
	import {appState} from '$lib/app-state.svelte'
	import {SvelteMap} from 'svelte/reactivity'
	import {uuid, slugify} from '$lib/utils'
	import {
		parseTxtFile,
		parseM3u,
		parseTrackTxt,
		importedSlug,
		importBackupFile,
		writeImport,
		validateBackup
	} from '$lib/import'
	import BackLink from '$lib/components/back-link.svelte'
	import Dropzone from '$lib/components/dropzone.svelte'
	import * as m from '$lib/paraglide/messages'
	import type {Channel, Track, ImportOrigin} from '$lib/types'

	// File System Access API not in TypeScript's default lib
	type DirHandle = FileSystemDirectoryHandle & {
		entries(): AsyncIterable<[string, FileSystemHandle]>
	}

	interface FolderImportResult {
		channel: Channel
		imported: number
		source: 'r4download' | 'backup' | 'audio'
	}

	const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window
	let scanning = $state(false)
	let results: FolderImportResult[] = $state([])
	let errors: string[] = $state([])
	let done = $state(false)

	async function readFileText(fileHandle: FileSystemFileHandle): Promise<string> {
		const file = await fileHandle.getFile()
		return file.text()
	}

	const AUDIO_EXTENSIONS = new Set(['.m4a', '.mp3', '.ogg', '.flac', '.wav', '.opus'])
	const LOCAL_TRACKS_RE = /^\.?\/tracks\//

	async function importR4Download(
		dirHandle: FileSystemDirectoryHandle,
		dirName: string,
		downloadJsonHandle: FileSystemFileHandle | null
	): Promise<FolderImportResult | null> {
		let channelTxtContent: string | null = null
		let m3uContent: string | null = null
		let tracksDir: FileSystemDirectoryHandle | null = null

		for await (const [name, handle] of (dirHandle as DirHandle).entries()) {
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

		if (downloadJsonHandle) {
			const raw: unknown = JSON.parse(await readFileText(downloadJsonHandle))
			validateBackup(raw)

			const slug = importedSlug(raw.channel.slug, raw.channel.id)
			if (!channelsCollection.isReady()) await channelsCollection.preload()
			const existing = [...channelsCollection.state.values()].find((c) => c.slug === slug)
			if (existing) return {channel: existing, imported: 0, source: 'r4download'}

			const channel: Channel = {...raw.channel, id: uuid(), slug}
			const tracks: Track[] = []

			const audioMap = new SvelteMap<string, FileSystemFileHandle>()
			if (tracksDir) {
				for await (const [name, handle] of (tracksDir as DirHandle).entries()) {
					if (handle.kind === 'file') audioMap.set(name, handle as FileSystemFileHandle)
				}
			}

			for (const t of raw.tracks) {
				let url = t.url
				const localPath = url.replace(LOCAL_TRACKS_RE, '')
				if (!url.startsWith('http') && audioMap.has(localPath)) {
					const file = await audioMap.get(localPath)!.getFile()
					url = URL.createObjectURL(file)
					tracks.push({...t, id: uuid(), slug, url, media_id: url, provider: 'file'} as Track)
				} else {
					tracks.push({...t, id: uuid(), slug, url} as Track)
				}
			}

			await writeImport(channel, tracks, {
				type: 'folder',
				importedAt: new Date().toISOString()
			} as ImportOrigin)
			return {channel, imported: tracks.length, source: 'r4download'}
		}

		if (!tracksDir && !m3uContent) return null

		const meta = channelTxtContent
			? parseTxtFile(channelTxtContent, dirName)
			: {name: dirName, slug: dirName, description: '', id: uuid()}

		const slug = importedSlug(meta.slug, meta.id)

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
			const audioFiles = new SvelteMap<string, FileSystemFileHandle>()
			const txtFiles = new SvelteMap<string, FileSystemFileHandle>()

			for await (const [name, handle] of (tracksDir as DirHandle).entries()) {
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
				if (txtHandle) {
					const parsed = parseTrackTxt(await readFileText(txtHandle))
					title = parsed.title
					const originalUrl = parsed.url
					description =
						originalUrl && !parsed.description.includes(originalUrl)
							? parsed.description
								? `${parsed.description}\n${originalUrl}`
								: originalUrl
							: parsed.description
				}
				tracks.push({
					id: uuid(),
					slug,
					title,
					description,
					url: objectUrl,
					media_id: objectUrl,
					provider: 'file'
				} as Track)
			}
		}

		if (tracks.length === 0 && m3uContent) {
			for (const t of parseM3u(m3uContent)) {
				tracks.push({id: uuid(), slug, title: t.title, url: t.url} as Track)
			}
		}

		await writeImport(channel, tracks, {
			type: 'folder',
			importedAt: new Date().toISOString()
		} as ImportOrigin)
		return {channel, imported: tracks.length, source: 'r4download'}
	}

	async function importJsonBackups(
		jsonHandles: FileSystemFileHandle[]
	): Promise<FolderImportResult[]> {
		const out: FolderImportResult[] = []
		for (const handle of jsonHandles) {
			try {
				const file = await handle.getFile()
				const result = await importBackupFile(file)
				out.push({...result, source: 'backup'})
			} catch (e) {
				errors = [...errors, `${handle.name}: ${(e as Error).message}`]
			}
		}
		return out
	}

	async function importAudioFolder(
		audioHandles: FileSystemFileHandle[],
		dirName: string
	): Promise<FolderImportResult | null> {
		if (!audioHandles.length) return null
		const id = uuid()
		const slug = importedSlug(slugify(dirName) || 'folder', id)
		const channel: Channel = {id: uuid(), slug, name: dirName, description: ''} as Channel
		const tracks: Track[] = []
		for (const handle of audioHandles) {
			const file = await handle.getFile()
			const objectUrl = URL.createObjectURL(file)
			const title = handle.name.slice(0, handle.name.lastIndexOf('.')) || handle.name
			tracks.push({
				id: uuid(),
				slug,
				title,
				url: objectUrl,
				media_id: objectUrl,
				provider: 'file'
			} as Track)
		}
		await writeImport(channel, tracks, {
			type: 'audio-folder',
			importedAt: new Date().toISOString()
		} as ImportOrigin)
		return {channel, imported: tracks.length, source: 'audio'}
	}

	async function scanDir(
		dirHandle: FileSystemDirectoryHandle,
		dirName: string
	): Promise<FolderImportResult[]> {
		const jsonHandles: FileSystemFileHandle[] = []
		let downloadJsonHandle: FileSystemFileHandle | null = null
		const rootAudioHandles: FileSystemFileHandle[] = []
		let hasM3u = false
		let hasTracksDir = false
		const subdirs: {handle: FileSystemDirectoryHandle; name: string}[] = []

		for await (const [name, handle] of (dirHandle as DirHandle).entries()) {
			if (handle.kind === 'file') {
				if (name === 'tracks.m3u') hasM3u = true
				else if (name === 'download.json') downloadJsonHandle = handle as FileSystemFileHandle
				else if (name.endsWith('.json')) jsonHandles.push(handle as FileSystemFileHandle)
				else {
					const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
					if (AUDIO_EXTENSIONS.has(ext)) rootAudioHandles.push(handle as FileSystemFileHandle)
				}
			} else if (handle.kind === 'directory') {
				if (name === 'tracks') hasTracksDir = true
				subdirs.push({handle: handle as FileSystemDirectoryHandle, name})
			}
		}

		if (hasM3u || hasTracksDir || downloadJsonHandle) {
			const r = await importR4Download(dirHandle, dirName, downloadJsonHandle)
			return r ? [r] : []
		}
		if (jsonHandles.length) {
			return importJsonBackups(jsonHandles)
		}
		if (rootAudioHandles.length) {
			const r = await importAudioFolder(rootAudioHandles, dirName)
			return r ? [r] : []
		}
		const subResults: FolderImportResult[] = []
		for (const {handle, name} of subdirs) {
			subResults.push(...(await scanDir(handle, name)))
		}
		return subResults
	}

	async function runScan(dirHandle: FileSystemDirectoryHandle) {
		errors = []
		results = []
		done = false
		scanning = true
		try {
			results = await scanDir(dirHandle, dirHandle.name)
			done = true
		} catch (e) {
			if ((e as Error).name !== 'AbortError') {
				errors = [...errors, (e as Error).message]
			}
		} finally {
			scanning = false
		}
	}

	async function pickFolder() {
		let dirHandle: FileSystemDirectoryHandle
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			dirHandle = await (window as any).showDirectoryPicker({mode: 'read'})
		} catch (e) {
			if ((e as Error).name !== 'AbortError') errors = [(e as Error).message]
			return
		}
		await runScan(dirHandle)
	}

	async function onDrop(event: DragEvent) {
		const item = event.dataTransfer?.items?.[0]
		if (!item) return
		const handle = await (
			item as DataTransferItem & {getAsFileSystemHandle?: () => Promise<FileSystemHandle>}
		).getAsFileSystemHandle?.()
		if (handle?.kind === 'directory') {
			await runScan(handle as FileSystemDirectoryHandle)
		}
	}

	function browseImported() {
		appState.channels_filter = 'imported'
		goto('/')
	}
</script>

<svelte:head>
	<title>{m.import_folder_title()}</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/settings/import')} />
		<h1>{m.import_folder_title()}</h1>
	</header>

	{#if !supported}
		<p>{m.import_folder_not_supported()}</p>
	{:else}
		<p>{m.import_folder_description()}</p>

		{#if !done}
			<Dropzone as="button" onclick={pickFolder} disabled={scanning} ondrop={onDrop}>
				{#if scanning}
					{m.import_folder_scanning()}
				{:else}
					{m.import_folder_dropzone()} <span class="browse-link">{m.import_folder_choose()}</span>
				{/if}
			</Dropzone>
		{/if}

		{#if errors.length}
			<ul role="alert">
				{#each errors as err (err)}
					<li>{err}</li>
				{/each}
			</ul>
		{/if}

		{#if done}
			{#if results.length === 0}
				<p>{m.import_folder_no_channels()}</p>
			{:else}
				{#each results as r (r.channel.id)}
					<p>
						{#if r.imported > 0}
							<strong>{r.channel.name}</strong> — {m.import_result_tracks({count: r.imported})}
						{:else}
							<strong>{r.channel.name}</strong> — {m.import_result_already()}
						{/if}
						<a href={resolve('/[slug]', {slug: r.channel.slug})}>{m.import_browse_channel()}</a>
					</p>
				{/each}
				<p>
					<button type="button" onclick={browseImported}>{m.import_browse_all()}</button>
				</p>
			{/if}
			<p>
				<button type="button" onclick={() => (done = false)}>{m.import_another()}</button>
			</p>
		{/if}
	{/if}
</article>
