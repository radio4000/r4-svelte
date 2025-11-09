<script>
	import {onMount} from 'svelte'
	import {Repo} from '@automerge/automerge-repo'
	import {IndexedDBStorageAdapter} from '@automerge/automerge-repo-storage-indexeddb'
	import {r5} from '$lib/r5'

	let repo = $state(null)
	let handle = $state(null)
	let doc = $state(null)
	let status = $state('initializing...')
	let searchQuery = $state('')
	let loading = $state(false)
	let showLimit = $state(50)

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
			handle.on('change', ({doc: newDoc}) => {
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

	async function loadRealChannel(slug) {
		if (!handle) return
		loading = true
		status = `Loading ${slug}...`

		try {
			// Pull channel and tracks from r4 (remote)
			const channels = await r5.channels.pull({slug})
			const tracks = await r5.tracks.pull({slug})

			status = `Loaded ${channels.length} channel(s) and ${tracks.length} tracks`

			// Add to Automerge document
			handle.change((d) => {
				// Add channels (if not already present)
				channels.forEach((channel) => {
					const exists = d.channels.find((c) => c.id === channel.id)
					if (!exists) {
						d.channels.push(channel)
					}
				})

				// Add tracks (if not already present)
				tracks.forEach((track) => {
					const exists = d.tracks.find((t) => t.id === track.id)
					if (!exists) {
						d.tracks.push(track)
					}
				})
			})
		} catch (err) {
			status = `Error loading ${slug}: ${err.message}`
			console.error(err)
		} finally {
			loading = false
		}
	}

	function clearData() {
		if (!handle) return
		if (!confirm('Clear all channels and tracks?')) return
		handle.change((d) => {
			d.channels = []
			d.tracks = []
		})
		status = 'Cleared all data'
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
				<h3>Load Real Data from r5 SDK</h3>
				<button onclick={() => loadRealChannel('oskar')} disabled={loading}> Load "oskar" channel </button>
				<button onclick={() => loadRealChannel('ko002')} disabled={loading}> Load "ko002" channel </button>
				<button onclick={clearData} disabled={loading}>Clear All Data</button>
			</div>

			<div class="controls">
				<h3>Test Data</h3>
				<button onclick={addChannel}>Add Channel</button>
				<button onclick={addTrack} disabled={!doc.channels?.length}>Add Track</button>
				<button onclick={() => addManyTracks(100)} disabled={!doc.channels?.length}> Add 100 Tracks </button>
				<button onclick={() => addManyTracks(1000)} disabled={!doc.channels?.length}> Add 1000 Tracks </button>
			</div>

			<div class="search">
				<h3>Search (no SQL, just JS filter)</h3>
				<input type="text" bind:value={searchQuery} placeholder="Search tracks..." />
			</div>

			<div class="tracks-list">
				<div style="display: flex; justify-content: space-between; align-items: center;">
					<h3>Tracks ({filteredTracks?.length || 0})</h3>
					<div style="display: flex; gap: 0.5rem;">
						<button onclick={() => (showLimit = 50)} disabled={showLimit === 50}>50</button>
						<button onclick={() => (showLimit = 200)} disabled={showLimit === 200}>200</button>
						<button onclick={() => (showLimit = 1000)} disabled={showLimit === 1000}>1000</button>
						<button onclick={() => (showLimit = filteredTracks.length)} disabled={showLimit >= filteredTracks.length}>
							All ({filteredTracks.length})
						</button>
					</div>
				</div>
				{#if filteredTracks.length > 0}
					<div class="track-items">
						{#each filteredTracks.slice(0, showLimit) as track (track.id)}
							<div class="track-item">
								<strong>{track.title}</strong>
								<small>{track.url}</small>
								{#if track.description}
									<small class="description">{track.description}</small>
								{/if}
							</div>
						{/each}
						{#if filteredTracks.length > showLimit}
							<p>
								<em>...showing {showLimit} of {filteredTracks.length} tracks</em>
							</p>
						{/if}
					</div>
				{:else}
					<p><em>No tracks yet. Load a real channel or add test data.</em></p>
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

	.track-item small.description {
		font-style: italic;
		opacity: 0.8;
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
