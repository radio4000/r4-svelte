<script lang="ts">
	import Menu from './menu.svelte'
	import {resetLocalData} from '$lib/api'
	import {queryClient, tracksCollection, channelsCollection, followsCollection} from '$lib/tanstack/collections'
	import {trackMetaCollection} from '$lib/tanstack/collections/track-meta'
	import {playHistoryCollection} from '$lib/tanstack/collections/play-history'
	import {cacheReady} from '$lib/tanstack/query-cache-persistence'
	import {browser} from '$app/environment'

	let tick = $state(0)
	const refresh = () => tick++

	$effect(() => {
		if (!browser) return
		return queryClient.getQueryCache().subscribe(() => tick++)
	})

	const cacheItemCount = (type: string) => {
		return queryClient
			.getQueryCache()
			.getAll()
			.filter((q) => q.queryKey[0] === type)
			.reduce((sum, q) => sum + (Array.isArray(q.state.data) ? q.state.data.length : 0), 0)
	}

	const collections = $derived.by(() => {
		void tick
		return [
			{name: 'tracks', size: tracksCollection.state.size, cached: cacheItemCount('tracks')},
			{name: 'channels', size: channelsCollection.state.size, cached: cacheItemCount('channels')},
			{name: 'follows', size: followsCollection.state.size, cached: cacheItemCount('follows')},
			{name: 'trackMeta', size: trackMetaCollection.state.size, cached: 0},
			{name: 'playHistory', size: playHistoryCollection.state.size, cached: 0}
		]
	})

	const cacheQueries = $derived.by(() => {
		void tick
		return queryClient
			.getQueryCache()
			.getAll()
			.map((q) => {
				const key = q.queryKey[0] as string
				const isSubset = (key === 'channels' || key === 'tracks') && q.queryKey.length > 1
				const data = q.state.data
				const hasData = Array.isArray(data) && data.length > 0 && data.every((x) => x != null)
				const willPersist = q.state.status === 'success' && hasData && !isSubset && key !== 'todos-cached'
				return {
					key: q.queryKey.join('/'),
					size: Array.isArray(data) ? data.length : data ? 1 : 0,
					status: q.state.status,
					stale: q.isStale(),
					willPersist,
					updatedAt: q.state.dataUpdatedAt ? new Date(q.state.dataUpdatedAt).toLocaleTimeString() : '-'
				}
			})
			.sort((a, b) => a.key.localeCompare(b.key))
	})

	const tracksBySlugs = $derived.by(() => {
		void tick
		const slugs: Record<string, number> = {}
		for (const track of tracksCollection.state.values()) {
			if (track.slug) {
				slugs[track.slug] = (slugs[track.slug] || 0) + 1
			}
		}
		return Object.entries(slugs).sort((a, b) => b[1] - a[1])
	})

	let persistenceReady = $state(false)
	$effect(() => {
		cacheReady.then(() => {
			persistenceReady = true
		})
	})

	async function invalidateAll() {
		await queryClient.invalidateQueries()
		refresh()
	}

	function clearCache() {
		queryClient.clear()
		refresh()
	}

	async function clearIDB() {
		if (!confirm('Clear IndexedDB cache? Page will reload.')) return
		resetLocalData()
		location.reload()
	}
</script>

<div class="constrained">
	<Menu />
	<h1>Tanstack Diagnostics</h1>
	<p>Collection sizes, query cache state, and persistence status.</p>
	<menu>
		<button onclick={refresh}>Refresh</button>
		<button onclick={invalidateAll}>Invalidate all</button>
		<button onclick={clearCache}>Clear cache</button>
		<button onclick={clearIDB}>Clear IDB + reload</button>
	</menu>

	<section>
		<p>{persistenceReady ? 'Persistence ready (restored from IDB)' : 'Loading...'}</p>
	</section>

	<section>
		<table>
			<thead>
				<tr><th>Collection</th><th>Memory</th><th>Cache</th></tr>
			</thead>
			<tbody>
				{#each collections as col (col.name)}
					<tr>
						<td>{col.name}</td>
						<td>{col.size}</td>
						<td>{col.cached || '-'}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		{#if tracksBySlugs.length}
			<details>
				<summary>Tracks by slug ({tracksBySlugs.length} channels in collection)</summary>
				<ul>
					{#each tracksBySlugs as [slug, count] (slug)}
						<li><code>{slug}</code>: {count}</li>
					{/each}
				</ul>
			</details>
		{/if}
	</section>

	<section>
		<h2>Query Cache ({cacheQueries.length})</h2>
		{#if cacheQueries.length}
			<table>
				<thead>
					<tr><th>Key</th><th>Items</th><th>Status</th><th>Stale</th><th>Persist</th><th>Updated</th></tr>
				</thead>
				<tbody>
					{#each cacheQueries as q (q.key)}
						<tr>
							<td><code>{q.key}</code></td>
							<td>{q.size}</td>
							<td>{q.status}</td>
							<td>{q.stale ? 'yes' : ''}</td>
							<td>{q.willPersist ? 'yes' : ''}</td>
							<td>{q.updatedAt}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p>Empty</p>
		{/if}
	</section>
</div>

<style>
	thead {
		text-align: left;
	}
	th {
		border-bottom: 1px solid;
	}
	section {
		margin-block-start: 2rem;
	}
</style>
