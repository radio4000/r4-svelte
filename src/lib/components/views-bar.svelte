<script lang="ts">
	import {serializeView, parseView, type View} from '$lib/views.svelte'
	import {viewsCollection, createView, updateView, deleteView, type SavedView} from '$lib/tanstack/collections'
	import {useLiveQuery} from '$lib/tanstack/useLiveQuery.svelte'
	import PopoverMenu from './popover-menu.svelte'
	import SortControls from './sort-controls.svelte'

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

	// Draft for adding mode + save name for both adding and dirty
	let draft = $state({
		name: '',
		channels: '',
		tags: '',
		tagsMode: 'any' as 'any' | 'all',
		order: 'created' as View['order'],
		direction: 'desc' as 'asc' | 'desc',
		limit: '',
		search: ''
	})

	function startAdding() {
		draft = {
			name: '',
			channels: '',
			tags: '',
			tagsMode: 'any',
			order: 'created',
			direction: 'desc',
			limit: '',
			search: ''
		}
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

	function buildViewFromDraft(): View {
		const v: View = {}
		const ch = splitList(draft.channels)
		if (ch.length) v.channels = ch
		const tg = splitList(draft.tags.replaceAll('#', ''))
		if (tg.length) v.tags = tg
		if (draft.tagsMode === 'all') v.tagsMode = 'all'
		if (draft.order) v.order = draft.order
		if (draft.direction) v.direction = draft.direction
		const n = Number(draft.limit)
		if (n > 0) v.limit = n
		const s = draft.search.trim()
		if (s) v.search = s
		return v
	}

	function saveNewView() {
		const name = draft.name.trim()
		if (!name) return
		const v = buildViewFromDraft()
		createView(name, v)
		lastSavedParams = serializeView(v).toString()
		mode = 'idle'
	}

	function saveDirtyAsNew() {
		const name = draft.name.trim()
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
		draft.name = ''
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
<nav aria-label="Saved views">
	<menu class="row">
		{#each savedViews as sv (sv.id)}
			<li>
				<button class="chip" class:active={activeViewId === sv.id} onclick={() => clickView(sv)}>
					{sv.name}
				</button>
				<button
					class="icon-btn"
					onclick={() => confirm(`Delete "${sv.name}"?`) && deleteView(sv.id)}
					aria-label="Delete {sv.name}">&times;</button
				>
			</li>
		{/each}
		<li>
			<button class="chip" onclick={startAdding} title="Add new view">+</button>
		</li>

		{#if mode !== 'adding'}
			<li class="controls">
				<PopoverMenu id="views-filter" closeOnClick={false} align="end">
					{#snippet trigger()}Filters{/snippet}
					<form class="form" onsubmit={(e) => e.preventDefault()}>
						<fieldset>
							<label for="vb-channels">Channels</label>
							<input
								id="vb-channels"
								type="text"
								value={view.channels?.join(', ') || ''}
								onchange={(e) => onchange({...view, channels: splitList(e.currentTarget.value)})}
								placeholder="oskar, ko002"
							/>
						</fieldset>
						<fieldset>
							<legend>Tags</legend>
							<fieldset class="row">
								<select
									value={view.tagsMode || 'any'}
									onchange={(e) => onchange({...view, tagsMode: e.currentTarget.value === 'all' ? 'all' : 'any'})}
								>
									<option value="any">any</option>
									<option value="all">all</option>
								</select>
								<input
									type="text"
									value={view.tags?.join(', ') || ''}
									onchange={(e) => onchange({...view, tags: splitList(e.currentTarget.value.replaceAll('#', ''))})}
									placeholder="ambient, jazz"
								/>
							</fieldset>
						</fieldset>
						<fieldset>
							<label for="vb-search">Search</label>
							<input
								id="vb-search"
								type="text"
								value={view.search || ''}
								onchange={(e) => onchange({...view, search: e.currentTarget.value.trim() || undefined})}
								placeholder="miles davis"
							/>
						</fieldset>
					</form>
				</PopoverMenu>
				<PopoverMenu id="views-display" closeOnClick={false} align="end">
					{#snippet trigger()}Display{/snippet}
					<form class="form" onsubmit={(e) => e.preventDefault()}>
						<fieldset>
							<legend>Sort</legend>
							<SortControls bind:order={r1Order} bind:direction={r1Direction} />
						</fieldset>
						<fieldset>
							<label for="vb-limit">Limit</label>
							<input
								id="vb-limit"
								type="number"
								value={view.limit || ''}
								onchange={(e) => onchange({...view, limit: Number(e.currentTarget.value) || undefined})}
								placeholder="20"
								min="1"
								max="4000"
							/>
						</fieldset>
					</form>
				</PopoverMenu>
			</li>
		{/if}
	</menu>

	<!-- Row 2: adding mode -->
	{#if mode === 'adding'}
		<section class="row row-2">
			<input
				type="text"
				bind:value={draft.name}
				placeholder="View name"
				onkeydown={(e) => e.key === 'Enter' && saveNewView()}
			/>

			<PopoverMenu id="views-add-filter" closeOnClick={false} align="end">
				{#snippet trigger()}Filters{/snippet}
				<form class="form" onsubmit={(e) => e.preventDefault()}>
					<fieldset>
						<label for="vb-add-channels">Channels</label>
						<input id="vb-add-channels" type="text" bind:value={draft.channels} placeholder="oskar, ko002" />
					</fieldset>
					<fieldset>
						<legend>Tags</legend>
						<fieldset class="row">
							<select bind:value={draft.tagsMode}>
								<option value="any">any</option>
								<option value="all">all</option>
							</select>
							<input type="text" bind:value={draft.tags} placeholder="ambient, jazz" />
						</fieldset>
					</fieldset>
					<fieldset>
						<label for="vb-add-search">Search</label>
						<input id="vb-add-search" type="text" bind:value={draft.search} placeholder="miles davis" />
					</fieldset>
				</form>
			</PopoverMenu>
			<PopoverMenu id="views-add-display" closeOnClick={false} align="end">
				{#snippet trigger()}Display{/snippet}
				<form class="form" onsubmit={(e) => e.preventDefault()}>
					<fieldset>
						<legend>Sort</legend>
						<SortControls bind:order={draft.order} bind:direction={draft.direction} />
					</fieldset>
					<fieldset>
						<label for="vb-add-limit">Limit</label>
						<input id="vb-add-limit" type="number" bind:value={draft.limit} placeholder="20" min="1" max="4000" />
					</fieldset>
				</form>
			</PopoverMenu>

			<button type="button" onclick={cancelAdding}>Cancel</button>
			<button type="button" class="primary" onclick={saveNewView} disabled={!draft.name.trim()}>Save</button>
		</section>
	{/if}

	<!-- Row 2: dirty mode -->
	{#if mode === 'dirty'}
		<section class="row row-2">
			<p>{viewSummary}</p>
			<button type="reset" class="ghost" onclick={clearDirty}>Clear</button>
			<input
				type="text"
				bind:value={draft.name}
				placeholder="Name"
				size="10"
				onkeydown={(e) => e.key === 'Enter' && saveDirtyAsNew()}
			/>
			<button type="button" onclick={saveDirtyAsNew} disabled={!draft.name.trim()}>Save as</button>
			{#if baseViewName}
				<button type="button" class="primary" onclick={updateBaseView}>Update "{baseViewName}"</button>
			{/if}
		</section>
	{/if}
</nav>

<style>
	nav {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		outline: 1px dashed red;
		padding: 0.5rem;
		margin-block-end: 2rem;
	}
	menu {
		outline: 1px dashed var(--gray-5);
	}
	.controls {
		margin-inline-start: auto;
	}
	.row-2 {
		align-items: center;
		outline: 1px dashed var(--gray-5);
		padding: 0.2rem;
	}
	.row-2 p {
		margin: 0;
		flex: 1;
	}
	.row-2 input[type='text'] {
		flex: 1;
	}
	.row-2 input[size] {
		flex: 0;
	}
	li {
		display: inline-flex;
		align-items: center;
		gap: 0;
	}
	li > .icon-btn {
		opacity: 0;
		margin-inline-start: -0.5rem;
		padding: 0;
		min-width: 1rem;
		min-height: 1rem;
	}
	li:hover > .icon-btn {
		opacity: 1;
	}
</style>
