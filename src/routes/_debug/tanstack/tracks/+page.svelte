<script lang="ts">
	import Menu from '../menu.svelte'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {eq} from '@tanstack/db'
	import {
		tracksCollection,
		addTrack,
		updateTrack,
		deleteTrack,
		queryClient,
		ensureTracksLoaded
	} from '$lib/tanstack/collections'
	import SyncStatus from '$lib/components/sync-status.svelte'
	import {appState} from '$lib/app-state.svelte'

	let error = $state('')

	const userChannel = $derived(appState.channel)

	// Debug: compact state
	const collectionSize = $derived(tracksCollection.state.size)
	const slugsInMemory = $derived([...new Set([...tracksCollection.state.values()].map((t) => t.slug))])
	const cacheLines = $derived(
		queryClient
			.getQueryCache()
			.getAll()
			.filter((q) => q.queryKey[0] === 'tracks')
			.map(
				(q) => `${q.queryKey.join('/')},${(q.state.data as unknown[])?.length ?? 0},${q.isStale() ? 'stale' : 'fresh'}`
			)
	)

	const tracksQuery = useLiveQuery((q) =>
		q
			.from({tracks: tracksCollection})
			.where(({tracks}) => eq(tracks.slug, userChannel?.slug || ''))
			.orderBy(({tracks}) => tracks.created_at)
			.limit(20)
	)

	async function handleInsert(e: SubmitEvent) {
		e.preventDefault()
		if (!userChannel) return
		const form = e.target as HTMLFormElement
		const formData = new FormData(form)
		try {
			await addTrack(userChannel, {
				url: formData.get('url') as string,
				title: formData.get('title') as string
			})
			form.reset()
			error = ''
		} catch (err) {
			error = (err as Error).message
		}
	}

	async function handleUpdate(trackId: string, currentTitle: string) {
		if (!userChannel) return
		const newTitle = prompt('New title:', currentTitle)
		if (!newTitle || newTitle === currentTitle) return
		try {
			await updateTrack(userChannel, trackId, {title: newTitle})
			error = ''
		} catch (err) {
			error = (err as Error).message
		}
	}

	async function handleDelete(id: string) {
		if (!userChannel) return
		try {
			await deleteTrack(userChannel, id)
			error = ''
		} catch (err) {
			error = (err as Error).message
		}
	}

	// Test loading
	let testSlug = $state('starttv')
	let testResult = $state('')

	async function testEnsureTracksLoaded() {
		testResult = 'Loading...'
		try {
			const before = [...tracksCollection.state.values()].filter((t) => t.slug === testSlug).length
			await ensureTracksLoaded(testSlug)
			const after = [...tracksCollection.state.values()].filter((t) => t.slug === testSlug).length
			testResult = `Before: ${before}, After: ${after} tracks for ${testSlug}`
		} catch (err) {
			testResult = `error: ${(err as Error).message}`
		}
	}
</script>

<div class="constrained">
	<Menu />
	<h1>Tracks</h1>
	<p>CRUD operations on tracks using TanStack DB collections.</p>

	{#if !userChannel}
		<p>Sign in to test tracks</p>
	{:else}
		<p>Add track to {userChannel.slug}</p>
		<form onsubmit={handleInsert}>
			<input name="url" value="https://www.youtube.com/watch?v=GGmGMEVbTAY" required />
			<input name="title" placeholder="Title" required />
			<button type="submit">Add</button>
		</form>
	{/if}

	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if tracksQuery.isLoading}
		<p>Loading…</p>
	{:else if tracksQuery.isError}
		<p class="error" role="alert">
			{tracksCollection.utils.lastError instanceof Error ? tracksCollection.utils.lastError.message : 'Sync failed'}
		</p>
	{:else if tracksQuery.data?.length}
		<h2>Latest 20 tracks</h2>
		<ul>
			{#each tracksQuery.data as track (track.id)}
				<li>
					{track.title}
					<button onclick={() => handleUpdate(track.id, track.title)}>edit</button>
					<button onclick={() => handleDelete(track.id)}>×</button>
				</li>
			{/each}
		</ul>
	{/if}

	<SyncStatus />

	<pre>collection: {collectionSize} ({slugsInMemory.join(', ') || 'none'})
cache:
{cacheLines.join('\n')}</pre>

	<h2>Test loading tracks</h2>
	<input type="text" bind:value={testSlug} placeholder="slug to load" />
	<button onclick={testEnsureTracksLoaded}>ensureTracksLoaded</button>
	<pre>{testResult}</pre>
</div>
