<script lang="ts">
	import Menu from '../menu.svelte'
	import {useLiveQuery, inArray} from '@tanstack/svelte-db'
	import {channelsCollection, createChannel, updateChannel, deleteChannel} from '../collections'
	import SyncStatus from '../sync-status.svelte'
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

<div class="SmallContainer">
	<Menu />

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

	{#if error}<p style="color: var(--red)">{error}</p>{/if}

	<details open>
		<summary>Your channels ({myChannels.length})</summary>
		{#if myChannelQuery.isLoading}
			<p>Loading…</p>
		{:else if myChannelQuery.isError}
			<p style="color: var(--red)">
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
		<summary>Latest {latestLimit} channels ({latestChannels.length})</summary>
		<label>Limit: <input type="number" bind:value={latestLimit} min="1" max="50" style="width: 4em" /></label>
		{#if latestQuery.isLoading}
			<p>Loading…</p>
		{:else if latestQuery.isError}
			<p style="color: var(--red)">
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

	<SyncStatus />
</div>
