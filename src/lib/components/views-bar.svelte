<script lang="ts">
	import {serializeView, parseView, type View} from '$lib/views.svelte'
	import {viewsCollection, createView, updateView, deleteView, type SavedView} from '$lib/collections/views'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import PopoverMenu from './popover-menu.svelte'
	import SortControls from './sort-controls.svelte'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	let {view, onchange}: {view: View; onchange: (view: View) => void} = $props()

	let mode: 'idle' | 'adding' | 'dirty' = $state('idle')

	/** Baseline for dirty detection. */
	let lastSavedParams = $state('')
	/** ID of the saved view we're working from (if any). */
	let baseViewId: string | null = $state(null)

	// Saved views from collection
	const viewsQuery = useLiveQuery(viewsCollection)
	const savedViews: SavedView[] = $derived(viewsQuery.data)

	// Active detection
	const currentParams = $derived(serializeView(view).toString())
	const activeViewId = $derived(savedViews.find((sv) => sv.params === currentParams)?.id ?? null)
	const baseViewName = $derived(baseViewId ? savedViews.find((sv) => sv.id === baseViewId)?.name : null)

	// Dirty detection
	$effect(() => {
		if (mode === 'adding') return
		mode = currentParams !== lastSavedParams ? 'dirty' : 'idle'
	})

	let draftName = $state('')

	function startAdding() {
		draftName = ''
		mode = 'adding'
	}

	function cancelAdding() {
		mode = 'idle'
	}

	function splitList(s: string) {
		return [
			...new Set(
				s
					.split(',')
					.map((x) => x.trim())
					.filter(Boolean)
			)
		]
	}

	function saveNewView() {
		const name = draftName.trim()
		if (!name) return
		createView(name, view)
		lastSavedParams = currentParams
		mode = 'idle'
	}

	function saveDirtyAsNew() {
		const name = draftName.trim()
		if (!name) return
		createView(name, view)
		lastSavedParams = currentParams
		baseViewId = null
		mode = 'idle'
	}

	function updateBaseView() {
		if (!baseViewId) return
		updateView(baseViewId, {params: currentParams})
		lastSavedParams = currentParams
		mode = 'idle'
	}

	function clearDirty() {
		onchange({})
		lastSavedParams = ''
		baseViewId = null
		draftName = ''
	}

	function clickView(sv: SavedView) {
		lastSavedParams = sv.params
		baseViewId = sv.id
		onchange(parseView(new URLSearchParams(sv.params)))
	}

	const viewSummary = $derived.by(() => {
		const parts: string[] = []
		if (view.channels?.length) parts.push(`channels: ${view.channels.join(', ')}`)
		if (view.tags?.length) parts.push(`tags: ${view.tags.join(', ')}`)
		if (view.search) parts.push(`search: ${view.search}`)
		if (view.order) parts.push(`order: ${view.order}`)
		if (view.direction === 'asc') parts.push('asc')
		if (view.limit) parts.push(`limit: ${view.limit}`)
		return parts.join(' \u00b7 ')
	})

	// Local state for row 1 SortControls (bind requires mutable state)
	let r1Order: View['order'] = $state('created')
	let r1Direction: 'asc' | 'desc' = $state('desc')

	// Sync inward from view prop
	$effect(() => {
		r1Order = view.order || 'created'
		r1Direction = view.direction || 'desc'
	})

	// Sync outward only when sort actually changed
	$effect(() => {
		const o = r1Order
		const d = r1Direction
		if (o !== (view.order || 'created') || d !== (view.direction || 'desc')) {
			onchange({...view, order: o, direction: d})
		}
	})
</script>

<!-- Row 1: tabs + controls -->
<nav class="views-bar">
	<section class="row row-1">
		<span>
			{#each savedViews as sv (sv.id)}
				<span class="chip-group">
					<button class="chip" class:active={activeViewId === sv.id} onclick={() => clickView(sv)}>
						{sv.name}
					</button>
					<button
						class="chip-delete"
						onclick={() => confirm(m.views_delete_confirm({name: sv.name})) && deleteView(sv.id)}
						aria-label={m.views_delete_aria({name: sv.name})}
					>
						<Icon icon="close" size={12} />
					</button>
				</span>
			{/each}
			{#if currentParams}
				<button class="chip" onclick={startAdding} title={m.views_add_new()}>+</button>
			{/if}
		</span>

		<menu class="controls">
			<li>
				<PopoverMenu id="views-filter" closeOnClick={false} align="end">
					{#snippet trigger()}{m.views_filters_label()}{/snippet}
					<form class="form" onsubmit={(e) => e.preventDefault()}>
						<fieldset>
							<label for="vb-channels">{m.views_channels_label()}</label>
							<input
								id="vb-channels"
								type="text"
								value={view.channels?.join(', ') || ''}
								onchange={(e) => onchange({...view, channels: splitList(e.currentTarget.value)})}
								placeholder={m.views_channels_placeholder()}
							/>
						</fieldset>
						<fieldset>
							<legend>{m.views_tags_label()}</legend>
							<fieldset class="row">
								<select
									value={view.tagsMode || 'any'}
									onchange={(e) => onchange({...view, tagsMode: e.currentTarget.value === 'all' ? 'all' : 'any'})}
								>
									<option value="any">{m.views_tags_any()}</option>
									<option value="all">{m.views_tags_all()}</option>
								</select>
								<input
									type="text"
									value={view.tags?.join(', ') || ''}
									onchange={(e) => onchange({...view, tags: splitList(e.currentTarget.value.replaceAll('#', ''))})}
									placeholder={m.views_tags_placeholder()}
								/>
							</fieldset>
						</fieldset>
						<fieldset>
							<label for="vb-search">{m.views_search_label()}</label>
							<input
								id="vb-search"
								type="text"
								value={view.search || ''}
								onchange={(e) => onchange({...view, search: e.currentTarget.value.trim() || undefined})}
								placeholder={m.views_search_placeholder()}
							/>
						</fieldset>
					</form>
				</PopoverMenu>
			</li>
			<li>
				<PopoverMenu id="views-display" closeOnClick={false} align="end">
					{#snippet trigger()}{m.views_display_label()}{/snippet}
					<form class="form" onsubmit={(e) => e.preventDefault()}>
						<fieldset>
							<legend>{m.views_sort_label()}</legend>
							<SortControls bind:order={r1Order} bind:direction={r1Direction} />
						</fieldset>
						<fieldset>
							<label for="vb-limit">{m.views_limit_label()}</label>
							<input
								id="vb-limit"
								type="number"
								value={view.limit || ''}
								onchange={(e) => onchange({...view, limit: Number(e.currentTarget.value) || undefined})}
								placeholder={m.views_limit_placeholder()}
								min="1"
								max="4000"
							/>
						</fieldset>
					</form>
				</PopoverMenu>
			</li>
		</menu>
	</section>

	<!-- Row 2: adding mode -->
	{#if mode === 'adding'}
		<section class="row row-2">
			<input
				type="text"
				bind:value={draftName}
				placeholder={m.views_view_name_placeholder()}
				onkeydown={(e) => e.key === 'Enter' && saveNewView()}
			/>
			<button type="button" onclick={cancelAdding}>{m.common_cancel()}</button>
			<button type="button" class="primary" onclick={saveNewView} disabled={!draftName.trim()}>{m.common_save()}</button
			>
		</section>
	{/if}

	<!-- Row 2: dirty mode -->
	{#if mode === 'dirty'}
		<section class="row row-2">
			<p>{viewSummary}</p>
			<button type="reset" class="ghost" onclick={clearDirty}>{m.common_clear()}</button>
			<input
				type="text"
				bind:value={draftName}
				placeholder={m.views_name_placeholder()}
				size="10"
				onkeydown={(e) => e.key === 'Enter' && saveDirtyAsNew()}
			/>
			<button type="button" onclick={saveDirtyAsNew} disabled={!draftName.trim()}>{m.views_save_as_label()}</button>
			{#if baseViewName}
				<button type="button" class="primary" onclick={updateBaseView}
					>{m.views_update_named({name: baseViewName})}</button
				>
			{/if}
		</section>
	{/if}
</nav>

<style>
	nav {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.row-1 {
		flex-wrap: nowrap;
	}
	.row-1 > span {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
	}
	.controls {
		margin-inline-start: auto;
		flex-shrink: 0;
	}
	.row-2 {
		align-items: center;
	}
	.row-2 p {
		flex: 1;
	}
	.row-2 input[type='text'] {
		flex: 1;
	}
	.row-2 input[size] {
		flex: 0;
	}
</style>
