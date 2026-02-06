<script lang="ts">
	import {SvelteSet} from 'svelte/reactivity'
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

	// ─── Per-channel query (CRUD) ───
	const tracksQuery = useLiveQuery((q) =>
		q
			.from({tracks: tracksCollection})
			.where(({tracks}) => eq(tracks.slug, userChannel?.slug || ''))
			.orderBy(({tracks}) => tracks.created_at)
			.limit(20)
	)

	// ─── Cross-collection query (all loaded channels) ───
	const recentTracks = useLiveQuery((q) =>
		q
			.from({tracks: tracksCollection})
			.orderBy(({tracks}) => tracks.created_at, 'desc')
			.limit(50)
	)

	// Reactive stats from the cross-collection query
	const slugsLoaded = $derived.by(() => {
		const slugs = new SvelteSet<string>()
		for (const track of recentTracks.data ?? []) {
			if (track.slug) slugs.add(track.slug)
		}
		return [...slugs].toSorted()
	})

	// ─── CRUD handlers ───
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

	// ─── Load tracks from any channel ───
	let testSlug = $state('starttv')
	let testResult = $state('')

	async function loadTracks() {
		testResult = 'Loading...'
		try {
			const before = [...tracksCollection.state.values()].filter((t) => t.slug === testSlug).length
			await ensureTracksLoaded(testSlug)
			const after = [...tracksCollection.state.values()].filter((t) => t.slug === testSlug).length
			testResult = `${testSlug}: ${before} → ${after} tracks`
		} catch (err) {
			testResult = `error: ${(err as Error).message}`
		}
	}

	// Debug: snapshots (not reactive, fine for debug)
	const cacheLines = $derived(
		queryClient
			.getQueryCache()
			.getAll()
			.filter((q) => q.queryKey[0] === 'tracks')
			.map(
				(q) =>
					`${q.queryKey.join('/')}: ${(q.state.data as unknown[])?.length ?? 0} (${q.isStale() ? 'stale' : 'fresh'})`
			)
	)
</script>

<div class="constrained">
	<Menu />
	<h1>Tracks</h1>

	<section>
		<h2>CRUD</h2>
		{#if !userChannel}
			<p>Sign in to test add/update/delete.</p>
		{:else}
			<p>Add track to <strong>{userChannel.slug}</strong></p>
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
			<p>{tracksQuery.data.length} tracks for {userChannel?.slug}</p>
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
	</section>

	<section>
		<h2>Load from any channel</h2>
		<p>Populate the collection with tracks from different channels, then see them combined below.</p>
		<fieldset class="row">
			<input type="text" bind:value={testSlug} placeholder="slug" />
			<button onclick={loadTracks}>ensureTracksLoaded</button>
		</fieldset>
		{#if testResult}<pre>{testResult}</pre>{/if}
	</section>

	<section>
		<h2>Cross-collection query</h2>
		<p>
			50 most recent tracks <strong>across all loaded channels</strong> — Query can't do this (each key is isolated). DB can.
		</p>
		<p>
			{recentTracks.data?.length ?? 0} tracks from {slugsLoaded.length} channels ({slugsLoaded.join(', ') || 'none'})
		</p>

		{#if recentTracks.data?.length}
			<table>
				<thead>
					<tr><th>Channel</th><th>Title</th><th>Created</th></tr>
				</thead>
				<tbody>
					{#each recentTracks.data as track (track.id)}
						<tr>
							<td><a href="/{track.slug}">{track.slug}</a></td>
							<td>{track.title}</td>
							<td>{track.created_at ? new Date(track.created_at).toLocaleDateString() : '-'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else if recentTracks.isLoading}
			<p>Loading...</p>
		{:else}
			<p><em>Load some channels above to see cross-collection queries in action.</em></p>
		{/if}
	</section>

	<section>
		<h2>Debug</h2>
		<SyncStatus />
		<details>
			<summary>Cache keys ({cacheLines.length})</summary>
			<pre>{cacheLines.join('\n') || 'none'}</pre>
		</details>
	</section>
</div>

<style>
	section {
		margin-block-end: var(--space-3);
	}
</style>
