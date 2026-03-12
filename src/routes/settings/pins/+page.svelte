<script lang="ts">
	import {
		viewsCollection,
		pinView,
		unpinView,
		reorderPinnedViews,
		deleteView,
		type SavedView
	} from '$lib/collections/views'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {resolve} from '$app/paths'
	import BackLink from '$lib/components/back-link.svelte'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	const viewsQuery = useLiveQuery(viewsCollection)

	const savedViews = $derived(viewsQuery.data ?? [])
	const pinned = $derived(
		savedViews.filter((v) => v.position != null).toSorted((a, b) => (a.position ?? 0) - (b.position ?? 0))
	)

	/** Unified list: pinned views first (by position), then unpinned (alphabetically). */
	const sortedViews = $derived(() => {
		const unpinned = savedViews
			.filter((sv) => sv.position == null)
			.toSorted((a, b) => a.name.localeCompare(b.name))
			.map((sv) => ({sv, isPinned: false as const, pinIndex: -1}))
		return [...pinned.map((sv, i) => ({sv, isPinned: true as const, pinIndex: i})), ...unpinned]
	})

	function togglePin(sv: SavedView) {
		if (sv.position != null) {
			unpinView(sv.id)
		} else {
			pinView(sv.id)
		}
	}

	function moveUp(index: number) {
		if (index <= 0) return
		const ids = pinned.map((v) => v.id)
		;[ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]
		reorderPinnedViews(ids)
	}

	function moveDown(index: number) {
		if (index >= pinned.length - 1) return
		const ids = pinned.map((v) => v.id)
		;[ids[index], ids[index + 1]] = [ids[index + 1], ids[index]]
		reorderPinnedViews(ids)
	}
</script>

<svelte:head>
	<title>{m.views_pins_title()}</title>
</svelte:head>

<article class="constrained">
	<header>
		<BackLink href={resolve('/settings')} />
		<h1>{m.views_pins_title()}</h1>
	</header>
	<p><small>{m.views_pins_intro()}</small></p>

	{#if !savedViews.length}
		<p>{m.views_no_saved()} <a href="/_debug/views">{m.views_create_first()}</a>.</p>
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
							aria-label={m.views_move_up()}
						>
							<Icon icon="arrow-up" size={16} />
						</button>
						<button
							class="btn"
							onclick={() => moveDown(item.pinIndex)}
							disabled={!item.isPinned || item.pinIndex === pinned.length - 1}
							class:invisible={!item.isPinned}
							aria-label={m.views_move_down()}
						>
							<Icon icon="arrow-down" size={16} />
						</button>
						{#if !item.isPinned}
							<button
								class="btn danger"
								onclick={() => confirm(m.views_delete_confirm({name: item.sv.name})) && deleteView(item.sv.id)}
								aria-label={m.views_delete_label()}
							>
								<Icon icon="delete" size={16} />
							</button>
						{/if}
						<button
							class="btn"
							onclick={() => togglePin(item.sv)}
							aria-label={item.isPinned ? m.views_unpin() : m.views_pin()}
						>
							<Icon icon={item.isPinned ? 'eye' : 'eye-close'} size={16} />
						</button>
					</span>
				</li>
			{/each}
		</menu>
		<p><a href={resolve('/search')}>{m.views_create_more()}</a></p>
	{/if}
</article>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-block: 1rem;
	}
	h1 {
		margin: 0;
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
