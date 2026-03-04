<script lang="ts">
	import {serializeView, parseView, viewLabel, type View, type ViewSource} from '$lib/views'
	import {viewsCollection, createView, updateView, deleteView, type SavedView} from '$lib/collections/views'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import PopoverMenu from './popover-menu.svelte'
	import SortControls from './sort-controls.svelte'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	let {view, onchange}: {view: View; onchange: (view: View) => void} = $props()

	const uid = $props.id()

	let mode: 'idle' | 'adding' | 'dirty' = $state('idle')

	/** Baseline for dirty detection. */
	let lastSavedParams = $state('')
	/** ID of the saved view we're working from (if any). */
	let baseViewId: string | null = $state(null)

	// Saved views from collection
	const viewsQuery = useLiveQuery(viewsCollection)
	const savedViews: SavedView[] = $derived(viewsQuery.data)

	// Active detection
	const currentParams = $derived(serializeView(view))
	const activeViewId = $derived(savedViews.find((sv) => sv.uri === currentParams)?.id ?? null)
	const baseViewName = $derived(baseViewId ? savedViews.find((sv) => sv.id === baseViewId)?.name : null)

	// Dirty detection
	$effect(() => {
		if (mode === 'adding') return
		mode = currentParams !== lastSavedParams ? 'dirty' : 'idle'
	})

	let draftName = $state('')

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

	function updateSource(index: number, s: ViewSource) {
		const sources = [...view.sources]
		sources[index] = s
		onchange({...view, sources})
	}

	function addSource() {
		onchange({...view, sources: [...view.sources, {}]})
	}

	function removeSource(index: number) {
		const sources = view.sources.filter((_, i) => i !== index)
		onchange({...view, sources: sources.length ? sources : [{}]})
	}

	function saveNewView() {
		const name = draftName.trim()
		if (!name) return
		createView(name, view)
		lastSavedParams = currentParams
		mode = 'idle'
	}

	function updateBaseView() {
		if (!baseViewId) return
		updateView(baseViewId, {uri: currentParams})
		lastSavedParams = currentParams
		mode = 'idle'
	}

	function clearDirty() {
		onchange({sources: [{}]})
		lastSavedParams = ''
		baseViewId = null
		draftName = ''
	}

	function clickView(sv: SavedView) {
		lastSavedParams = sv.uri
		baseViewId = sv.id
		onchange(parseView(sv.uri))
	}

	const viewSummary = $derived.by(() => {
		const parts: string[] = []
		const label = viewLabel(view)
		if (label) parts.push(label)
		if (view.order) parts.push(`order: ${view.order}`)
		if (view.direction === 'asc') parts.push('asc')
		if (view.limit) parts.push(`limit: ${view.limit}`)
		if (view.exclude?.length) parts.push(`exclude: ${view.exclude.length}`)
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
			<!-- {#if currentParams}
				<button class="chip" onclick={startAdding} title={m.views_add_new()}>+</button>
			{/if} -->
		</span>

		<menu class="controls">
			{#if mode === 'dirty'}
				<li><button type="reset" class="ghost" onclick={clearDirty}>{m.common_clear()}</button></li>
			{/if}
			<li>
				<PopoverMenu closeOnClick={false} align="end">
					{#snippet trigger()}{m.views_filters_label()}{/snippet}
					<form class="form" onsubmit={(e) => e.preventDefault()}>
						{#each view.sources as s, i (i)}
							<div class="query-group">
								{#if view.sources.length > 1}
									<header class="query-header">
										<strong>Source {i + 1}</strong>
										<button type="button" onclick={() => removeSource(i)} data-no-close data-delete>
											<Icon icon="delete" size={12} />
										</button>
									</header>
								{/if}
								<fieldset>
									<label for="{uid}-channels-{i}">{m.views_channels_label()}</label>
									<input
										id="{uid}-channels-{i}"
										type="text"
										value={s.channels?.join(', ') || ''}
										onchange={(e) => updateSource(i, {...s, channels: splitList(e.currentTarget.value)})}
										placeholder={m.views_channels_placeholder()}
									/>
								</fieldset>
								<fieldset>
									<legend>{m.views_tags_label()}</legend>
									<fieldset class="row">
										<select
											value={s.tagsMode || 'any'}
											onchange={(e) =>
												updateSource(i, {...s, tagsMode: e.currentTarget.value === 'all' ? 'all' : 'any'})}
										>
											<option value="any">{m.views_tags_any()}</option>
											<option value="all">{m.views_tags_all()}</option>
										</select>
										<input
											type="text"
											value={s.tags?.join(', ') || ''}
											onchange={(e) =>
												updateSource(i, {...s, tags: splitList(e.currentTarget.value.replaceAll('#', ''))})}
											placeholder={m.views_tags_placeholder()}
										/>
									</fieldset>
								</fieldset>
								<fieldset>
									<label for="{uid}-search-{i}">{m.views_search_label()}</label>
									<input
										id="{uid}-search-{i}"
										type="text"
										value={s.search || ''}
										onchange={(e) => updateSource(i, {...s, search: e.currentTarget.value.trim() || undefined})}
										placeholder={m.views_search_placeholder()}
									/>
								</fieldset>
							</div>
							{#if i < view.sources.length - 1}<hr />{/if}
						{/each}
						<button type="button" onclick={addSource} data-no-close>+ Source</button>
					</form>
				</PopoverMenu>
			</li>
			<li>
				<PopoverMenu closeOnClick={false} align="end">
					{#snippet trigger()}{m.views_display_label()}{/snippet}
					<form class="form" onsubmit={(e) => e.preventDefault()}>
						<fieldset>
							<legend>{m.views_sort_label()}</legend>
							<SortControls bind:order={r1Order} bind:direction={r1Direction} />
						</fieldset>
						<fieldset>
							<label for="{uid}-limit">{m.views_limit_label()}</label>
							<input
								id="{uid}-limit"
								type="number"
								value={view.limit || ''}
								onchange={(e) => onchange({...view, limit: Number(e.currentTarget.value) || undefined})}
								placeholder={m.views_limit_placeholder()}
								min="1"
								max="4000"
							/>
						</fieldset>
						<fieldset>
							<label for="{uid}-exclude">Exclude track IDs</label>
							<input
								id="{uid}-exclude"
								type="text"
								value={view.exclude?.join(', ') || ''}
								onchange={(e) => {
									const ids = splitList(e.currentTarget.value)
									onchange({...view, exclude: ids.length ? ids : undefined})
								}}
								placeholder="uuid-1, uuid-2"
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

	<!-- Row 2: dirty mode (update existing saved view) -->
	{#if mode === 'dirty' && baseViewName}
		<section class="row row-2">
			<p>{viewSummary}</p>
			<button type="button" class="primary" onclick={updateBaseView}
				>{m.views_update_named({name: baseViewName})}</button
			>
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
	.query-group {
		padding: 0.25rem;
		border-radius: 0.25rem;
	}
	.query-group:has([data-delete]:hover) {
		box-shadow: inset 0 0 0 1px currentColor;
	}
	.query-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
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
</style>
