<script lang="ts">
	import {
		viewsCollection,
		pinsCollection,
		createPin,
		deletePin,
		reorderPins,
		deleteView,
		type Pin
	} from '$lib/tanstack/collections'
	import {useLiveQuery} from '$lib/tanstack/useLiveQuery.svelte'
	import Icon from '$lib/components/icon.svelte'

	const viewsQuery = useLiveQuery(viewsCollection)
	const pinsQuery = useLiveQuery(pinsCollection)

	const savedViews = $derived(viewsQuery.data ?? [])
	const pins = $derived((pinsQuery.data ?? []).toSorted((a: Pin, b: Pin) => a.position - b.position))

	/** Unified list: pinned views first (by position), then unpinned (alphabetically). */
	const sortedViews = $derived(() => {
		const pinMap = new Map(pins.map((p: Pin, i: number) => [p.view_id, {pin: p, index: i}]))
		const pinned = pins
			.map((p: Pin, i: number) => {
				const sv = savedViews.find((v) => v.id === p.view_id)
				return sv ? {sv, pin: p, pinIndex: i, isPinned: true as const} : null
			})
			.filter((x) => x !== null)
		const unpinned = savedViews
			.filter((sv) => !pinMap.has(sv.id))
			.toSorted((a, b) => a.name.localeCompare(b.name))
			.map((sv) => ({sv, pin: null, pinIndex: -1, isPinned: false as const}))
		return [...pinned, ...unpinned]
	})

	function togglePin(viewId: string) {
		const existing = pins.find((p: Pin) => p.view_id === viewId)
		if (existing) {
			deletePin(existing.id)
		} else {
			createPin(viewId)
		}
	}

	function moveUp(index: number) {
		if (index <= 0) return
		const ids = pins.map((p: Pin) => p.id)
		;[ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]
		reorderPins(ids)
	}

	function moveDown(index: number) {
		if (index >= pins.length - 1) return
		const ids = pins.map((p: Pin) => p.id)
		;[ids[index], ids[index + 1]] = [ids[index + 1], ids[index]]
		reorderPins(ids)
	}
</script>

<svelte:head>
	<title>Pins</title>
</svelte:head>

<article class="constrained">
	<a href="/settings">&larr; Settings</a>
	<h1>Pins</h1>
	<p><small>Pretty neat for quick access</small></p>

	{#if !savedViews.length}
		<p>No saved views yet. <a href="/_debug/views">Create some first</a>.</p>
	{:else}
		<menu class="nav-vertical">
			{#each sortedViews() as item (item.sv.id)}
				<li class="row" class:unpinned={!item.isPinned}>
					<span class="view-name">{item.sv.name}</span>
					<span class="order-buttons">
						<button
							class="btn"
							onclick={() => moveUp(item.pinIndex)}
							disabled={!item.isPinned || item.pinIndex === 0}
							class:invisible={!item.isPinned}
							aria-label="Move up"
						>
							<Icon icon="arrow-up" size={16} />
						</button>
						<button
							class="btn"
							onclick={() => moveDown(item.pinIndex)}
							disabled={!item.isPinned || item.pinIndex === pins.length - 1}
							class:invisible={!item.isPinned}
							aria-label="Move down"
						>
							<Icon icon="arrow-down" size={16} />
						</button>
						{#if !item.isPinned}
							<button
								class="btn danger"
								onclick={() => confirm(`Delete "${item.sv.name}"?`) && deleteView(item.sv.id)}
								aria-label="Delete view"
							>
								<Icon icon="delete" size={16} />
							</button>
						{/if}
						<button class="btn" onclick={() => togglePin(item.sv.id)} aria-label={item.isPinned ? 'Unpin' : 'Pin'}>
							<Icon icon={item.isPinned ? 'eye' : 'eye-close'} size={16} />
						</button>
					</span>
				</li>
			{/each}
		</menu>
		<p><a href="/search">Create more on the search page</a></p>
	{/if}
</article>

<style>
	h1 {
		margin-block-start: 1rem;
	}
	menu {
		margin-block: 1rem;
	}
	menu .row {
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem;
	}
	.unpinned:not(:hover) {
		opacity: 0.5;
	}
	.order-buttons {
		display: flex;
		gap: 0.25rem;
	}
	.invisible {
		visibility: hidden;
	}
</style>
