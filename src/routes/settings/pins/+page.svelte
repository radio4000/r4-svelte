<script lang="ts">
	import {viewsCollection, pinsCollection, createPin, deletePin, reorderPins, type Pin} from '$lib/tanstack/collections'
	import {useLiveQuery} from '$lib/tanstack/useLiveQuery.svelte'
	import Icon from '$lib/components/icon.svelte'

	const viewsQuery = useLiveQuery(viewsCollection)
	const pinsQuery = useLiveQuery(pinsCollection)

	const savedViews = $derived(viewsQuery.data ?? [])
	const pins = $derived((pinsQuery.data ?? []).toSorted((a: Pin, b: Pin) => a.position - b.position))
	const pinnedViewIds = $derived(new Set(pins.map((p: Pin) => p.view_id)))

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

	function viewNameById(viewId: string): string {
		return savedViews.find((v) => v.id === viewId)?.name ?? '(deleted)'
	}
</script>

<svelte:head>
	<title>Pins</title>
</svelte:head>

<article class="constrained">
	<a href="/settings">&larr; Settings</a>
	<h1>Pins</h1>
	<p>Pin saved views to the sidebar for quick access.</p>

	{#if !savedViews.length}
		<p>No saved views yet. <a href="/_debug/views">Create some first</a>.</p>
	{:else}
		<h2>Saved views</h2>
		<menu class="row">
			{#each savedViews as sv (sv.id)}
				<button class="chip" class:active={pinnedViewIds.has(sv.id)} onclick={() => togglePin(sv.id)}>
					{sv.name}
				</button>
			{/each}
		</menu>

		{#if pins.length}
			<h2>Order</h2>
			<menu class="nav-vertical">
				{#each pins as pin, i (pin.id)}
					<li class="order-row">
						<span>{viewNameById(pin.view_id)}</span>
						<span class="order-buttons">
							<button class="btn" onclick={() => moveUp(i)} disabled={i === 0} aria-label="Move up">
								<Icon icon="arrow-up" size={16} />
							</button>
							<button class="btn" onclick={() => moveDown(i)} disabled={i === pins.length - 1} aria-label="Move down">
								<Icon icon="arrow-down" size={16} />
							</button>
							<button class="btn" onclick={() => deletePin(pin.id)} aria-label="Remove pin">
								<Icon icon="close" size={16} />
							</button>
						</span>
					</li>
				{/each}
			</menu>
		{/if}
	{/if}
</article>

<style>
	h1 {
		margin-block: 1rem;
	}
	h2 {
		margin-block: 1rem 0.5rem;
		font-size: var(--font-4);
	}
	.order-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.order-buttons {
		display: flex;
		gap: 0.25rem;
	}
</style>
