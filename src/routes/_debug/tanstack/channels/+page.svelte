<script lang="ts">
	import Menu from '../menu.svelte'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {inArray, not, isNull, gte} from '@tanstack/db'
	import {channelsCollection, createChannel, updateChannel, deleteChannel} from '$lib/collections/channels'
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
	// Test: does setWindow() trigger a new queryFn call with updated limit?
	let paginationLimit = $state(3)
	let paginationOffset = $state(0)
	const paginationQuery = useLiveQuery((q) =>
		q
			.from({channels: channelsCollection})
			.orderBy(({channels}) => channels.created_at, 'desc')
			.limit(paginationLimit)
	)
	const paginationChannels = $derived(paginationQuery.data ?? [])
	const paginationCollection = $derived(paginationQuery.collection)

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
	let activeFilter = $state<FilterPreset>('all')
	let filterLimit = $state(10)
	const filterQuery = useLiveQuery((q) => {
		let base = q.from({channels: channelsCollection})
		if (activeFilter === '10+') base = base.where(({channels}) => gte(channels.track_count, 10))
		else if (activeFilter === '100+') base = base.where(({channels}) => gte(channels.track_count, 100))
		else if (activeFilter === '1000+') base = base.where(({channels}) => gte(channels.track_count, 1000))
		else if (activeFilter === 'artwork') {
			base = base
				.where(({channels}) => gte(channels.track_count, 2))
				.where(({channels}) => not(isNull(channels.image)))
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
		filterLog = [...filterLog, `filter=${f} limit=${filterLimit} → ${count} rows (${status})`]
	})

	let setWindowLog = $state<string[]>([])

	async function testSetWindow(newLimit: number, newOffset: number) {
		const utils = paginationCollection?.utils as {setWindow?: (opts: {limit?: number; offset?: number}) => true | Promise<void>}
		if (!utils?.setWindow) {
			setWindowLog = [...setWindowLog, `ERROR: setWindow not found on collection.utils`]
			return
		}
		const before = paginationChannels.length
		setWindowLog = [...setWindowLog, `setWindow({limit: ${newLimit}, offset: ${newOffset}}) — before: ${before} rows`]
		try {
			const result = utils.setWindow({limit: newLimit, offset: newOffset})
			if (result === true) {
				setWindowLog = [...setWindowLog, `  → returned true (no fetch needed, data already present)`]
			} else {
				setWindowLog = [...setWindowLog, `  → returned Promise (fetching…)`]
				await result
				setWindowLog = [...setWindowLog, `  → fetch complete, now: ${paginationChannels.length} rows`]
			}
		} catch (err) {
			setWindowLog = [...setWindowLog, `  → ERROR: ${(err as Error).message}`]
		}
	}

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
			Status: <code>{bulkQuery.status}</code> ·
			Rows: <strong>{bulkChannels.length}</strong>
			{#if bulkElapsed > 0} · {bulkElapsed.toFixed(0)}ms{/if}
		</p>
		<div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
			<button onclick={() => { bulkLimit = 100; bulkT0 = performance.now(); bulkElapsed = 0 }}>100</button>
			<button onclick={() => { bulkLimit = 500; bulkT0 = performance.now(); bulkElapsed = 0 }}>500</button>
			<button onclick={() => { bulkLimit = 1000; bulkT0 = performance.now(); bulkElapsed = 0 }}>1000</button>
			<button onclick={() => { bulkLimit = 5000; bulkT0 = performance.now(); bulkElapsed = 0 }}>5000</button>
			<button onclick={() => { bulkLimit = 0; bulkElapsed = 0 }}>reset</button>
		</div>
		{#if bulkChannels.length}
			<p>First: {bulkChannels[0]?.slug} · Last: {bulkChannels[bulkChannels.length - 1]?.slug}</p>
		{/if}
	</details>

	<details open>
		<summary>Filter switching proof</summary>
		<p>Tests whether changing <code>.where()</code> triggers new queryFn calls with correct filters.</p>
		<p>
			Status: <code>{filterQuery.status}</code> ·
			Filter: <strong>{activeFilter}</strong> ·
			Rows: <strong>{filterChannels.length}</strong>
		</p>
		<div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
			{#each /** @type {FilterPreset[]} */ (['all', '10+', '100+', '1000+', 'artwork', 'geo']) as f}
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
		<summary>Pagination proof</summary>
		<p>Tests whether <code>setWindow()</code> triggers the collection queryFn with updated limit/offset.</p>
		<p>
			Status: <code>{paginationQuery.status}</code> ·
			Rows: <strong>{paginationChannels.length}</strong> ·
			Collection: <code>{paginationCollection ? 'yes' : 'no'}</code>
		</p>
		<div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
			<label>Limit: <input type="number" bind:value={paginationLimit} min="1" max="50" style="width: 4em" /></label>
			<label>Offset: <input type="number" bind:value={paginationOffset} min="0" max="100" style="width: 4em" /></label>
			<button onclick={() => testSetWindow(paginationLimit, paginationOffset)}>setWindow()</button>
			<button onclick={() => testSetWindow(paginationLimit + 5, paginationOffset)}>+5 limit</button>
			<button onclick={() => testSetWindow(paginationLimit, paginationOffset + paginationLimit)}>next page</button>
			<button onclick={() => (setWindowLog = [])}>clear log</button>
		</div>
		{#if paginationChannels.length}
			<table>
				<thead><tr><th>#</th><th>slug</th><th>created</th></tr></thead>
				<tbody>
					{#each paginationChannels as ch, i (ch.id)}
						<tr>
							<td>{paginationOffset + i + 1}</td>
							<td>{ch.slug}</td>
							<td>{ch.created_at ? new Date(ch.created_at).toLocaleDateString() : '-'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
		{#if setWindowLog.length}
			<pre style="font-size: 0.8em; max-height: 12rem; overflow: auto;">{setWindowLog.join('\n')}</pre>
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
