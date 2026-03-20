<script lang="ts">
	import {untrack} from 'svelte'
	import Menu from '../menu.svelte'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {inArray, not, isNull, gte} from '@tanstack/db'
	import {
		channelsCollection,
		createChannel,
		updateChannel,
		deleteChannel,
		fetchChannelCount
	} from '$lib/collections/channels'
	import {appState} from '$lib/app-state.svelte'

	let error = $state('')
	let latestLimit = $state(5)

	const user = $derived(appState.user)

	// Fetch all user's channels by ID
	const myChannelQuery = useLiveQuery((q) =>
		q.from({channels: channelsCollection}).where(({channels}) => inArray(channels.id, appState.channels || []))
	)

	// Fetch latest channels for browsing
	const latestQuery = useLiveQuery((q) =>
		q
			.from({channels: channelsCollection})
			.orderBy(({channels}) => channels.created_at, 'desc')
			.limit(latestLimit)
	)

	// --- Pagination proof ---
	// Same pattern as channels.svelte: reactive limit covers currentPage * pageSize,
	// collection accumulates rows, local slice picks the current page.
	const PAGE_SIZE = 3
	let currentPage = $state(1)
	const queryLimit = $derived(currentPage * PAGE_SIZE)
	const paginationQuery = useLiveQuery((q) =>
		q
			.from({channels: channelsCollection})
			.orderBy(({channels}) => channels.created_at, 'desc')
			.limit(queryLimit)
	)
	const paginationAll = $derived(paginationQuery.data ?? [])
	const paginationChannels = $derived(paginationAll.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE))
	const hasMore = $derived(paginationAll.length >= queryLimit)
	let serverCount = $state(0)
	fetchChannelCount().then((n) => (serverCount = n))
	const totalPages = $derived(serverCount > 0 ? Math.ceil(serverCount / PAGE_SIZE) : 0)

	// --- Bulk fetch proof (map case) ---
	let bulkLimit = $state(0)
	let bulkT0 = $state(0)
	let bulkElapsed = $state(0)
	const bulkQuery = useLiveQuery((q) => {
		if (!bulkLimit) return null
		return q
			.from({channels: channelsCollection})
			.where(({channels}) => not(isNull(channels.latitude)))
			.orderBy(({channels}) => channels.created_at, 'desc')
			.limit(bulkLimit)
	})
	const bulkChannels = $derived(bulkQuery.data ?? [])
	$effect(() => {
		if (bulkChannels.length && bulkT0) {
			bulkElapsed = performance.now() - bulkT0
		}
	})

	// --- Filter switching proof ---
	type FilterPreset = 'all' | '10+' | '100+' | '1000+' | 'artwork' | 'geo'
	const filterPresets: FilterPreset[] = ['all', '10+', '100+', '1000+', 'artwork', 'geo']
	let activeFilter = $state<FilterPreset>('all')
	let filterLimit = $state(10)
	const filterQuery = useLiveQuery((q) => {
		let base = q.from({channels: channelsCollection})
		if (activeFilter === '10+') base = base.where(({channels}) => gte(channels.track_count, 10))
		else if (activeFilter === '100+') base = base.where(({channels}) => gte(channels.track_count, 100))
		else if (activeFilter === '1000+') base = base.where(({channels}) => gte(channels.track_count, 1000))
		else if (activeFilter === 'artwork') {
			base = base.where(({channels}) => gte(channels.track_count, 2)).where(({channels}) => not(isNull(channels.image)))
		} else if (activeFilter === 'geo') {
			base = base.where(({channels}) => not(isNull(channels.latitude)))
		}
		return base.orderBy(({channels}) => channels.created_at, 'desc').limit(filterLimit)
	})
	const filterChannels = $derived(filterQuery.data ?? [])
	let filterLog = $state<string[]>([])
	$effect(() => {
		const f = activeFilter
		const count = filterChannels.length
		const status = filterQuery.status
		filterLog = [...untrack(() => filterLog), `filter=${f} limit=${filterLimit} → ${count} rows (${status})`]
	})

	const myChannels = $derived(myChannelQuery.data || [])
	const latestChannels = $derived(latestQuery.data || [])

	async function handleCreate(e: SubmitEvent) {
		e.preventDefault()
		const form = e.target as HTMLFormElement
		const formData = new FormData(form)
		try {
			await createChannel({
				name: formData.get('name') as string,
				slug: formData.get('slug') as string,
				description: formData.get('description') as string
			})
			form.reset()
			error = ''
		} catch (err) {
			error = (err as Error).message
		}
	}

	async function handleUpdate(id: string, currentName: string) {
		const newName = prompt('New name:', currentName)
		if (!newName || newName === currentName) return
		try {
			await updateChannel(id, {name: newName})
			error = ''
		} catch (err) {
			error = (err as Error).message
		}
	}

	async function handleDelete(id: string, name: string) {
		if (!confirm(`Delete channel "${name}"?`)) return
		try {
			await deleteChannel(id)
			error = ''
		} catch (err) {
			error = (err as Error).message
		}
	}
</script>

<div class="constrained">
	<Menu />
	<h1>Channels</h1>
	<p>CRUD operations on channels using TanStack DB collections.</p>

	{#if !user}
		<p>Sign in to manage channels</p>
	{:else}
		<h2>Create channel</h2>
		<form onsubmit={handleCreate}>
			<input name="name" placeholder="Name" required />
			<input
				name="slug"
				placeholder="slug"
				required
				pattern="[a-z0-9-]+"
				minlength="3"
				title="At least 3 lowercase letters, numbers, or hyphens"
			/>
			<input name="description" placeholder="Description" />
			<button type="submit">Create</button>
		</form>
	{/if}

	{#if error}<p class="error" role="alert">{error}</p>{/if}

	<details open>
		<summary>Your channels ({myChannels.length})</summary>
		{#if myChannelQuery.isLoading}
			<p>Loading…</p>
		{:else if myChannelQuery.isError}
			<p class="error" role="alert">
				{channelsCollection.utils.lastError instanceof Error
					? channelsCollection.utils.lastError.message
					: 'Sync failed'}
			</p>
		{:else if myChannels.length}
			<table>
				<thead>
					<tr><th>slug</th><th>name</th><th>actions</th></tr>
				</thead>
				<tbody>
					{#each myChannels as channel (channel.id)}
						<tr>
							<td>{channel.slug}</td>
							<td>{channel.name}</td>
							<td>
								<button onclick={() => handleUpdate(channel.id, channel.name)}>edit</button>
								<button onclick={() => handleDelete(channel.id, channel.name)}>×</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else if user}
			<p>No channels yet</p>
		{:else}
			<p>Sign in to see your channels</p>
		{/if}
	</details>

	<details open>
		<summary>Bulk fetch proof (map case)</summary>
		<p>Tests fetching large datasets — channels with coordinates, like the map view needs.</p>
		<p>
			Status: <code>{bulkQuery.status}</code> · Rows: <strong>{bulkChannels.length}</strong>
			{#if bulkElapsed > 0}
				· {bulkElapsed.toFixed(0)}ms{/if}
		</p>
		<div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
			<button
				onclick={() => {
					bulkLimit = 100
					bulkT0 = performance.now()
					bulkElapsed = 0
				}}>100</button
			>
			<button
				onclick={() => {
					bulkLimit = 500
					bulkT0 = performance.now()
					bulkElapsed = 0
				}}>500</button
			>
			<button
				onclick={() => {
					bulkLimit = 1000
					bulkT0 = performance.now()
					bulkElapsed = 0
				}}>1000</button
			>
			<button
				onclick={() => {
					bulkLimit = 5000
					bulkT0 = performance.now()
					bulkElapsed = 0
				}}>5000</button
			>
			<button
				onclick={() => {
					bulkLimit = 0
					bulkElapsed = 0
				}}>reset</button
			>
		</div>
		{#if bulkChannels.length}
			<p>First: {bulkChannels[0]?.slug} · Last: {bulkChannels.at(-1)?.slug}</p>
		{/if}
	</details>

	<details open>
		<summary>Filter switching proof</summary>
		<p>Tests whether changing <code>.where()</code> triggers new queryFn calls with correct filters.</p>
		<p>
			Status: <code>{filterQuery.status}</code> · Filter: <strong>{activeFilter}</strong> · Rows:
			<strong>{filterChannels.length}</strong>
		</p>
		<div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
			{#each filterPresets as f (f)}
				<button class:active={activeFilter === f} onclick={() => (activeFilter = f)}>{f}</button>
			{/each}
			<label>Limit: <input type="number" bind:value={filterLimit} min="1" max="100" style="width: 4em" /></label>
			<button onclick={() => (filterLog = [])}>clear log</button>
		</div>
		{#if filterChannels.length}
			<table>
				<thead><tr><th>slug</th><th>tracks</th><th>image</th><th>coords</th></tr></thead>
				<tbody>
					{#each filterChannels.slice(0, 5) as ch (ch.id)}
						<tr>
							<td>{ch.slug}</td>
							<td>{ch.track_count ?? '?'}</td>
							<td>{ch.image ? 'yes' : 'no'}</td>
							<td>{ch.latitude ? 'yes' : 'no'}</td>
						</tr>
					{/each}
					{#if filterChannels.length > 5}
						<tr><td colspan="4">…and {filterChannels.length - 5} more</td></tr>
					{/if}
				</tbody>
			</table>
		{/if}
		{#if filterLog.length}
			<pre style="font-size: 0.8em; max-height: 12rem; overflow: auto;">{filterLog.join('\n')}</pre>
		{/if}
	</details>

	<details open>
		<summary>Pagination proof (prev / X of Y / next)</summary>
		<p>
			Reactive <code>.limit(currentPage * pageSize)</code> — collection accumulates rows, local slice picks current
			page. Same pattern as <code>channels.svelte</code>.
		</p>
		<p>
			Status: <code>{paginationQuery.status}</code> · Query limit: <strong>{queryLimit}</strong> · Total fetched:
			<strong>{paginationAll.length}</strong> · Page rows: <strong>{paginationChannels.length}</strong>
		</p>
		<div style="display: flex; gap: 0.5rem; align-items: center;">
			<button disabled={currentPage <= 1} onclick={() => (currentPage -= 1)}>← prev</button>
			<span>{currentPage}{totalPages ? ` of ${totalPages}` : ''}</span>
			<button disabled={!hasMore && currentPage >= totalPages} onclick={() => (currentPage += 1)}>next →</button>
			<button disabled={currentPage === 1} onclick={() => (currentPage = 1)}>reset</button>
		</div>
		{#if paginationChannels.length}
			<table>
				<thead><tr><th>#</th><th>slug</th><th>created</th></tr></thead>
				<tbody>
					{#each paginationChannels as ch, i (ch.id)}
						<tr>
							<td>{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
							<td>{ch.slug}</td>
							<td>{ch.created_at ? new Date(ch.created_at).toLocaleDateString() : '-'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</details>

	<details open>
		<summary>Latest {latestLimit} channels ({latestChannels.length})</summary>
		<label>Limit: <input type="number" bind:value={latestLimit} min="1" max="50" style="width: 4em" /></label>
		{#if latestQuery.isLoading}
			<p>Loading…</p>
		{:else if latestQuery.isError}
			<p class="error" role="alert">
				{channelsCollection.utils.lastError instanceof Error
					? channelsCollection.utils.lastError.message
					: 'Sync failed'}
			</p>
		{:else if latestChannels.length}
			<table>
				<thead>
					<tr><th>slug</th><th>name</th><th>created</th></tr>
				</thead>
				<tbody>
					{#each latestChannels as ch (ch.id)}
						<tr>
							<td>{ch.slug}</td>
							<td>{ch.name}</td>
							<td>{ch.created_at ? new Date(ch.created_at).toLocaleDateString() : '-'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p>No channels found</p>
		{/if}
	</details>
</div>

<style>
	details {
		margin-block: 1rem;
	}
</style>
