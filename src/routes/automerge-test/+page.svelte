<script>
	import { onMount } from 'svelte'
	import { Repo } from '@automerge/automerge-repo'
	import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'

	let repo = $state(null)
	let handle = $state(null)
	let doc = $state(null)
	let status = $state('initializing...')
	let searchQuery = $state('')

	// Derived state - filtering tracks without SQL
	let filteredTracks = $derived(
		!doc?.tracks
			? []
			: !searchQuery
				? doc.tracks
				: doc.tracks.filter(
						(track) =>
							track.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
							track.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
							track.url?.toLowerCase().includes(searchQuery.toLowerCase())
					)
	)

	// Derived state - group tracks by channel (unused but shows pattern)
	let tracksByChannel = $derived(
		!doc?.tracks
			? {}
			: doc.tracks.reduce((acc, track) => {
					const channelId = track.channel_id || 'unknown'
					if (!acc[channelId]) acc[channelId] = []
					acc[channelId].push(track)
					return acc
				}, {})
	)

	onMount(async () => {
		try {
			// Create a repo with IndexedDB storage
			repo = new Repo({
				storage: new IndexedDBStorageAdapter('automerge-test'),
				network: []
			})

			// Check URL hash for existing doc
			const docUrl = window.location.hash.slice(1)
			if (docUrl && docUrl.startsWith('automerge:')) {
				handle = repo.find(docUrl)
			} else {
				// Create a new document with realistic data structure
				handle = repo.create({
					channels: [],
					tracks: [],
					// App state could live here too
					currentChannel: null,
					isPlaying: false
				})
				window.location.hash = handle.url
			}

			await handle.whenReady()

			// Get initial doc
			doc = handle.docSync()
			status = 'ready'

			// Listen for changes (this is the key reactivity bridge!)
			handle.on('change', ({ doc: newDoc }) => {
				doc = newDoc
			})
		} catch (err) {
			status = `Error: ${err.message}`
			console.error(err)
		}
	})

	function addChannel() {
		if (!handle) return
		handle.change((d) => {
			d.channels.push({
				id: crypto.randomUUID(),
				name: `Channel ${d.channels.length + 1}`,
				slug: `channel-${d.channels.length + 1}`,
				created_at: new Date().toISOString()
			})
		})
	}

	function addTrack() {
		if (!handle || !doc?.channels.length) return
		const channelId = doc.channels[0].id

		handle.change((d) => {
			d.tracks.push({
				id: crypto.randomUUID(),
				channel_id: channelId,
				title: `Track ${d.tracks.length + 1}`,
				url: `https://youtube.com/watch?v=${crypto.randomUUID().slice(0, 11)}`,
				created_at: new Date().toISOString()
			})
		})
	}

	function addManyTracks(count) {
		if (!handle || !doc?.channels.length) return
		const channelId = doc.channels[0].id

		handle.change((d) => {
			for (let i = 0; i < count; i++) {
				d.tracks.push({
					id: crypto.randomUUID(),
					channel_id: channelId,
					title: `Bulk Track ${d.tracks.length + i + 1}`,
					url: `https://youtube.com/watch?v=${crypto.randomUUID().slice(0, 11)}`,
					description: `This is a test track for performance testing`,
					created_at: new Date().toISOString()
				})
			}
		})
	}
</script>

<div class="test-page">
	<h1>Automerge Test: Channels & Tracks</h1>

	<section>
		<p>Status: <strong>{status}</strong></p>

		{#if doc}
			<div class="stats">
				<p><strong>Channels:</strong> {doc.channels?.length || 0}</p>
				<p><strong>Tracks:</strong> {doc.tracks?.length || 0}</p>
				<p><strong>Filtered:</strong> {filteredTracks?.length || 0}</p>
			</div>

			<div class="controls">
				<h3>Actions</h3>
				<button onclick={addChannel}>Add Channel</button>
				<button onclick={addTrack} disabled={!doc.channels?.length}>Add Track</button>
				<button onclick={() => addManyTracks(100)} disabled={!doc.channels?.length}>
					Add 100 Tracks
				</button>
				<button onclick={() => addManyTracks(1000)} disabled={!doc.channels?.length}>
					Add 1000 Tracks
				</button>
			</div>

			<div class="search">
				<h3>Search (no SQL, just JS filter)</h3>
				<input type="text" bind:value={searchQuery} placeholder="Search tracks..." />
			</div>

			<div class="tracks-list">
				<h3>Tracks ({filteredTracks?.length || 0})</h3>
				{#if filteredTracks.length > 0}
					<div class="track-items">
						{#each filteredTracks.slice(0, 50) as track}
							<div class="track-item">
								<strong>{track.title}</strong>
								<small>{track.url}</small>
							</div>
						{/each}
						{#if filteredTracks.length > 50}
							<p><em>...showing 50 of {filteredTracks.length} tracks</em></p>
						{/if}
					</div>
				{:else}
					<p><em>No tracks yet. Add a channel first, then add tracks.</em></p>
				{/if}
			</div>

			<details>
				<summary>Full Document (JSON)</summary>
				<div class="doc-display">
					<pre>{JSON.stringify(doc, null, 2)}</pre>
				</div>
			</details>
		{/if}
	</section>
</div>

<style>
	.test-page {
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	.stats {
		display: flex;
		gap: 2rem;
		margin: 1rem 0;
		padding: 1rem;
		background: var(--bg-secondary, #f5f5f5);
		border-radius: 4px;
	}

	.stats p {
		margin: 0;
	}

	.doc-display {
		background: var(--bg-secondary, #f5f5f5);
		padding: 1rem;
		border-radius: 4px;
		margin: 1rem 0;
		max-height: 400px;
		overflow: auto;
	}

	pre {
		overflow: auto;
		margin: 0;
	}

	.controls,
	.search {
		margin: 1rem 0;
	}

	.controls {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
	}

	.controls h3,
	.search h3 {
		width: 100%;
		margin: 0 0 0.5rem 0;
	}

	input[type='text'] {
		padding: 0.5rem;
		width: 100%;
		max-width: 400px;
	}

	.tracks-list {
		margin: 2rem 0;
	}

	.track-items {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 500px;
		overflow-y: auto;
	}

	.track-item {
		padding: 0.5rem;
		background: var(--bg-secondary, #f5f5f5);
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.track-item small {
		color: var(--text-secondary, #666);
		font-size: 0.875rem;
	}

	details {
		margin: 2rem 0;
	}

	summary {
		cursor: pointer;
		padding: 0.5rem;
		background: var(--bg-secondary, #f5f5f5);
		border-radius: 4px;
	}
</style>
