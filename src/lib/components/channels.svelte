<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {capabilities} from '$lib/modes'
	import {appState} from '$lib/app-state.svelte'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import {channelsCollection} from '$lib/collections/channels'
	import {queryClient} from '$lib/collections/query-client'
	import {cacheReady} from '$lib/query-cache-persistence'
	import {loadMoreChannels, fetchChannelCount, CHANNELS_PAGE_SIZE} from '$lib/collections/channels'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {getChannelActivity} from '$lib/channel-activity.svelte'
	const channelActivity = $derived(getChannelActivity())
	import {toChannelCardMedia} from '$lib/components/channel-ui-state.js'
	import {
		viewIconMap,
		viewLabelMap,
		handleCanvasClick as onCanvasClick,
		handleCanvasDoubleClick
	} from '$lib/components/channels-view-shared.js'
	import {gte, inArray, not, isNull} from '@tanstack/db'
	import {featuredScore} from '$lib/utils'
	import ChannelCard from './channel-card.svelte'
	import Dialog from './dialog.svelte'
	import Icon from './icon.svelte'
	import PopoverMenu from './popover-menu.svelte'
	import SearchInput from './search-input.svelte'
	import SortControls from './sort-controls.svelte'
	import SpectrumScanner from './spectrum-scanner.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import * as m from '$lib/paraglide/messages'

	const {
		display: initialDisplay = undefined,
		defaultFilter = 'featured',
		filter: filterProp = undefined,
		filterBasePath = undefined,
		searchHref = undefined,
		tabs
	} = $props()

	let searchValue = $state('')
	$effect(() => {
		const q = searchValue.trim()
		if (!q || !searchHref) return
		goto(`${searchHref}?q=${encodeURIComponent(q)}`, {replaceState: true})
	})

	const filterSlugMap = {
		featured: 'featured',
		all: 'all',
		broadcasting: 'broadcasting',
		artwork: 'with-artwork',
		imported: 'imported',
		'10+': 'with-more-than-10-tracks',
		'100+': 'with-more-than-100-tracks',
		'1000+': 'with-more-than-1000-tracks'
	}

	function slugFor(f) {
		return filterSlugMap[f] ?? f
	}

	const filterLabelMap = {
		all: () => m.channels_filter_option_all(),
		broadcasting: () => m.channels_filter_option_broadcasting(),
		imported: () => m.channels_filter_option_imported(),
		'10+': () => m.channels_filter_option_10(),
		'100+': () => m.channels_filter_option_100(),
		'1000+': () => m.channels_filter_option_1000(),
		artwork: () => m.channels_filter_option_artwork(),
		featured: () => m.channels_filter_option_featured()
	}

	let showFeaturedInfo = $state(false)
	let showPaginationDialog = $state(false)
	let paginationInitialPage = $state(1)

	let paginatedLimit = $state(CHANNELS_PAGE_SIZE)
	let fetchedUpTo = $state(CHANNELS_PAGE_SIZE)
	let nextPageSize = $state(CHANNELS_PAGE_SIZE)
	let loadedAll = $state(false)
	let loadingMore = $state(false)

	const currentPage = $derived(Math.max(1, parseInt(page.url.searchParams.get('page') ?? '1') || 1))
	const pageSize = $derived(Math.max(1, parseInt(page.url.searchParams.get('per') ?? '12') || 12))
	let filter = $derived(
		filterProp && filterProp in filterLabelMap
			? filterProp
			: appState.channels_filter in filterLabelMap
				? appState.channels_filter
				: defaultFilter
	)
	let order = $derived(appState.channels_order || 'shuffle')
	let orderDirection = $derived(appState.channels_order_direction)

	const VALID_DISPLAYS = new Set(['grid', 'list', 'map', 'tuner', 'infinite'])
	/** @type {'grid' | 'list' | 'map' | 'tuner' | 'infinite'}*/
	let display = $derived.by(() => {
		const urlDisplay = page.url.searchParams.get('display')
		if (VALID_DISPLAYS.has(urlDisplay)) return /** @type {any} */ (urlDisplay)
		if (VALID_DISPLAYS.has(appState.channels_display)) return appState.channels_display
		if (VALID_DISPLAYS.has(initialDisplay)) return initialDisplay
		return 'grid'
	})

	// Keep display in URL in sync
	$effect(() => {
		if (!page.url.searchParams.has('display')) {
			const query = new URL(page.url).searchParams
			query.set('display', display)
			goto(`?${query.toString()}`, {replaceState: true, keepFocus: true})
		}
	})

	const isPaged = $derived(display === 'grid' || display === 'list')

	/** Minimum channel count for views that need a dense dataset */
	const VIEW_MIN_LIMIT = {infinite: 400, tuner: 400, map: Infinity}
	const queryLimit = $derived(
		filter === 'featured'
			? 50
			: Math.max(VIEW_MIN_LIMIT[display] ?? 0, isPaged ? currentPage * pageSize : paginatedLimit)
	)

	// Reactive broadcast IDs for the broadcasting filter
	const broadcastsQuery = useLiveQuery((q) => q.from({b: broadcastsCollection}))
	const broadcastIds = $derived(
		(broadcastsQuery.data ?? []).map((b) => /** @type {{channel_id: string}} */ (b).channel_id)
	)
	const activeChannelIds = $derived(channelActivity.activeChannelIds)
	const activeChannelId = $derived(activeChannelIds[0] ?? undefined)

	/** @type {Record<string, string>} Sort key → DB column name (or 'shuffle' for random view) */
	const sortColumns = {
		shuffle: 'shuffle',
		updated: 'latest_track_at',
		created: 'created_at',
		name: 'name',
		tracks: 'track_count'
	}

	/** @type {Record<string, number>} Filter → minimum track count */
	const filterMinTracks = {artwork: 2, '10+': 10, '100+': 100, '1000+': 1000}

	/** Map UI filter/sort state → ChannelQueryParams for loadMoreChannels */
	const channelQueryParams = $derived.by(() => ({
		idIn: filter === 'broadcasting' && broadcastIds.length ? broadcastIds : undefined,
		trackCountGte: filter === 'featured' ? 10 : filterMinTracks[filter],
		imageNotNull: filter === 'artwork' || filter === 'featured',
		shuffle: filter !== 'featured' && order === 'shuffle',
		orderColumn: filter === 'featured' ? sortColumns['updated'] : sortColumns[order],
		ascending: (orderDirection || 'desc') === 'asc',
		limit: filter === 'featured' ? 50 : undefined
	}))

	// Reset pagination when filter/sort changes
	$effect(() => {
		void filter
		void order
		void orderDirection
		paginatedLimit = CHANNELS_PAGE_SIZE
		fetchedUpTo = CHANNELS_PAGE_SIZE
		loadedAll = false
		nextPageSize = CHANNELS_PAGE_SIZE
	})

	// Fetch channels driven by the active filter + sort
	const channelsQuery = useLiveQuery((q) => {
		let base = q.from({ch: channelsCollection})
		if (!capabilities.globalBrowse) {
			const q = base.orderBy(({ch}) => ch.created_at, 'desc')
			return queryLimit === Infinity ? q : q.limit(queryLimit)
		}
		if (filter === 'imported') {
			const ids = appState.local_channel_ids ?? []
			if (!ids.length) return base.orderBy(({ch}) => ch.created_at, 'asc').limit(0)
			const q = base.where(({ch}) => inArray(ch.id, ids)).orderBy(({ch}) => ch.created_at, 'desc')
			return queryLimit === Infinity ? q : q.limit(queryLimit)
		} else if (filter === 'broadcasting') {
			if (!broadcastIds.length) return base.orderBy(({ch}) => ch.created_at, 'asc').limit(0)
			base = base.where(({ch}) => inArray(ch.id, broadcastIds))
		} else if (filter === 'featured') {
			base = base
				.where(({ch}) => gte(ch.track_count, 10))
				.where(({ch}) => not(isNull(ch.image)))
				.orderBy(({ch}) => ch.latest_track_at, 'desc')
		} else {
			const minTracks = filterMinTracks[filter]
			if (minTracks) base = base.where(({ch}) => gte(ch.track_count, minTracks))
			if (filter === 'artwork') base = base.where(({ch}) => not(isNull(ch.image)))
		}
		if (filter !== 'featured') {
			const col = sortColumns[order]
			if (col) {
				base = base.orderBy(({ch}) => ch[col], order === 'shuffle' ? 'asc' : orderDirection || 'desc')
			}
		}
		return queryLimit === Infinity ? base : base.limit(queryLimit)
	})
	const channelsRaw = $derived(channelsQuery.data ?? [])
	// For featured: score and take top 12; for paged views: slice to current page; otherwise all
	const channels = $derived.by(() => {
		if (filter === 'featured') return channelsRaw.toSorted((a, b) => featuredScore(b) - featuredScore(a)).slice(0, 12)
		if (isPaged) return channelsRaw.slice((currentPage - 1) * pageSize, currentPage * pageSize)
		return channelsRaw
	})
	const hasMore = $derived(filter !== 'featured' && !loadedAll && channelsRaw.length >= paginatedLimit)

	// Server-side total count for pagination (N/M display)
	let serverCount = $state(0)
	$effect(() => {
		if (!isPaged || filter === 'broadcasting' || filter === 'imported' || filter === 'featured') {
			serverCount = 0
			return
		}
		serverCount = 0
		const params = channelQueryParams
		void fetchChannelCount(params)
			.then((n) => {
				serverCount = n
			})
			.catch(() => {})
	})
	const totalCount = $derived(
		filter === 'broadcasting'
			? broadcastIds.length
			: filter === 'imported'
				? (appState.local_channel_ids?.length ?? 0)
				: serverCount
	)
	const totalPages = $derived(totalCount > 0 && pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0)
	const hasNextPage = $derived(
		isPaged && filter !== 'featured' && (totalPages > 0 ? currentPage < totalPages : channels.length === pageSize)
	)
	const hasPrevPage = $derived(isPaged && currentPage > 1)

	// Restore imported channels into the collection on filter activation.
	// appState.local_channels is the durable source — persisted in localStorage.
	// Migration: channels imported before local_channels existed are recovered from
	// the query cache (populated by writeImport via setQueryData).
	$effect(() => {
		if (filter !== 'imported') return
		const ids = appState.local_channel_ids ?? []
		if (!ids.length) return
		void (async () => {
			// Migrate: find IDs in local_channel_ids not yet in local_channels
			const knownIds = new Set((appState.local_channels ?? []).map((c) => c.id))
			const unmigratedIds = ids.filter((id) => !knownIds.has(id))
			if (unmigratedIds.length) {
				await cacheReady
				/** @type {import('$lib/types').Channel[]} */
				const migrated = []
				for (const query of queryClient.getQueryCache().getAll()) {
					if (query.queryKey[0] !== 'channels' || query.state.status !== 'success') continue
					for (const ch of /** @type {any[]} */ (query.state.data) ?? []) {
						if (unmigratedIds.includes(ch.id)) migrated.push(ch)
					}
				}
				if (migrated.length) {
					appState.local_channels = [...(appState.local_channels ?? []), ...migrated]
				}
				// Clean up IDs whose data is unrecoverable (cache expired, data truly gone)
				const recoveredIds = new Set(migrated.map((c) => c.id))
				const stillMissing = unmigratedIds.filter((id) => !recoveredIds.has(id))
				if (stillMissing.length) {
					const stillMissingSet = new Set(stillMissing)
					appState.local_channel_ids = (appState.local_channel_ids ?? []).filter((id) => !stillMissingSet.has(id))
				}
			}
			// Write any still-missing channels into the collection
			const localChannels = appState.local_channels ?? []
			await (channelsCollection.isReady() ? Promise.resolve() : channelsCollection.preload())
			for (const ch of localChannels) {
				if (!channelsCollection.get(ch.id)) channelsCollection.utils.writeUpsert(ch)
			}
		})()
	})

	// Auto-fetch from supabase when the query needs more data than we have
	$effect(() => {
		if (!capabilities.globalBrowse) return
		if (filter === 'imported') return
		if (queryLimit > fetchedUpTo && !loadedAll && !loadingMore) {
			fetchUpTo(queryLimit)
		}
	})

	/** Fetch from supabase until we have at least `target` rows (or exhaust the dataset) */
	async function fetchUpTo(target) {
		loadingMore = true
		try {
			while (fetchedUpTo < target && !loadedAll) {
				const batch = Math.min(nextPageSize, target - fetchedUpTo)
				const result = await loadMoreChannels({
					...channelQueryParams,
					offset: fetchedUpTo,
					limit: batch
				})
				fetchedUpTo += batch
				if (result.length < batch) loadedAll = true
				nextPageSize = Math.min(nextPageSize * 2, 500)
			}
		} finally {
			loadingMore = false
		}
	}

	async function handleLoadMore() {
		paginatedLimit += nextPageSize
		if (filter !== 'imported' && paginatedLimit > fetchedUpTo && !loadedAll) {
			await fetchUpTo(paginatedLimit)
		}
	}

	const orderedChannels = $derived(channels)

	const canvasMedia = $derived(orderedChannels.map((c) => toChannelCardMedia(c, channelActivity)))

	const openSlug = $derived(page.url.searchParams.get('slug'))
	let selectedCanvasChannelId = $state(/** @type {string | null} */ (null))

	$effect(() => {
		if (!openSlug || !orderedChannels.length) return
		const match = orderedChannels.find((c) => c.slug === openSlug)
		if (match?.id) selectedCanvasChannelId = match.id
	})

	function handleCanvasClick(item) {
		onCanvasClick(item, (id) => (selectedCanvasChannelId = id))
	}

	/** @param {'grid' | 'list' | 'map' | 'tuner' | 'infinite'} value */
	function setDisplay(value = 'grid') {
		appState.channels_display = value
		const query = new URL(page.url).searchParams
		query.set('display', value)
		query.delete('page')
		// Preserve map params if switching to map view
		if (value !== 'map') {
			query.delete('latitude')
			query.delete('longitude')
			query.delete('zoom')
		}
		goto(`?${query.toString()}`, {replaceState: true, keepFocus: true})
	}

	function setFilter(value) {
		if (filterBasePath) {
			goto(resolve(/** @type {any} */ (filterBasePath + '/' + slugFor(value))))
			return
		}
		appState.channels_filter = value
		const query = new URL(page.url).searchParams
		query.set('filter', value)
		query.delete('page')
		goto(`?${query.toString()}`, {replaceState: true, keepFocus: true})
	}

	function setPage(n) {
		const query = new URL(page.url).searchParams
		if (n <= 1) query.delete('page')
		else query.set('page', String(n))
		goto(`?${query.toString()}`, {keepFocus: true})
	}

	function setPageSize(n) {
		const size = Math.max(1, Math.min(200, n || 12))
		const query = new URL(page.url).searchParams
		if (size === 12) query.delete('per')
		else query.set('per', String(size))
		query.delete('page')
		goto(`?${query.toString()}`, {replaceState: true, keepFocus: true})
	}
</script>

<div class={`layout layout--${display}`}>
	<menu class="filtermenu">
		{#if tabs}{@render tabs()}{/if}
		<PopoverMenu triggerAttachment={tooltip({content: m.channels_filter_label()})}>
			{#snippet trigger()}<Icon icon="filter-alt" /> {filterLabelMap[filter]()}{/snippet}
			<menu class="nav-vertical">
				<button
					class:active={filter === 'featured'}
					onclick={() => setFilter('featured')}
					{@attach tooltip({content: m.channels_filter_tooltip_featured(), position: 'right'})}
					>{m.channels_filter_option_featured()}</button
				>
				<button
					class:active={filter === 'all'}
					onclick={() => setFilter('all')}
					{@attach tooltip({content: m.channels_filter_tooltip_all(), position: 'right'})}
					>{m.channels_filter_option_all()}</button
				>
				{#if broadcastsCollection.state.size}
					<button
						class:active={filter === 'broadcasting'}
						onclick={() => setFilter('broadcasting')}
						{@attach tooltip({content: m.channels_filter_tooltip_broadcasting(), position: 'right'})}
						>{m.channels_filter_option_broadcasting()}<span
							class="channel-badge"
							style:background="var(--color-red)"
							style:color="white">{broadcastsCollection.state.size}</span
						></button
					>
				{/if}
				<button
					class:active={filter === '10+'}
					onclick={() => setFilter('10+')}
					{@attach tooltip({content: m.channels_filter_tooltip_10(), position: 'right'})}
					>{m.channels_filter_option_10()}</button
				>
				<button
					class:active={filter === '100+'}
					onclick={() => setFilter('100+')}
					{@attach tooltip({content: m.channels_filter_tooltip_100(), position: 'right'})}
					>{m.channels_filter_option_100()}</button
				>
				<button
					class:active={filter === '1000+'}
					onclick={() => setFilter('1000+')}
					{@attach tooltip({content: m.channels_filter_tooltip_1000(), position: 'right'})}
					>{m.channels_filter_option_1000()}</button
				>
				<button
					class:active={filter === 'artwork'}
					onclick={() => setFilter('artwork')}
					{@attach tooltip({content: m.channels_filter_tooltip_artwork(), position: 'right'})}
					>{m.channels_filter_option_artwork()}</button
				>
				{#if appState.local_channel_ids?.length}
					<button
						class:active={filter === 'imported'}
						onclick={() => setFilter('imported')}
						{@attach tooltip({content: m.channels_filter_tooltip_imported(), position: 'right'})}
						>{m.channels_filter_option_imported()}</button
					>
				{/if}
			</menu>
		</PopoverMenu>

		{#if filter === 'featured'}
			<button
				class="btn"
				onclick={() => (showFeaturedInfo = true)}
				aria-label={m.channels_featured_info_label()}
				{@attach tooltip({content: m.channels_featured_info_label()})}
			>
				<Icon icon="circle-info" />
			</button>
			<Dialog bind:showModal={showFeaturedInfo}>
				{#snippet header()}<h2>{m.channels_featured_info_title()}</h2>{/snippet}
				<p>{m.channels_featured_info_body()}</p>
			</Dialog>
		{/if}

		{#if display === 'map' && hasMore}
			<button class="btn" onclick={handleLoadMore} disabled={loadingMore}>
				{loadingMore ? '…' : `+${nextPageSize}`}
			</button>
		{/if}

		{#if isPaged && filter !== 'featured' && (hasPrevPage || hasNextPage || totalPages > 1)}
			<span class="pagination">
				<button onclick={() => setPage(currentPage - 1)} disabled={!hasPrevPage} aria-label="Previous page">←</button>
				<button
					class="page-label"
					onclick={() => {
						paginationInitialPage = currentPage
						showPaginationDialog = true
					}}
					aria-label="Go to page"
					>{currentPage}{#if totalPages > 0}/{totalPages}{/if}</button
				>
				<button onclick={() => setPage(currentPage + 1)} disabled={!hasNextPage} aria-label="Next page"
					>{loadingMore ? '…' : '→'}</button
				>
			</span>
			<Dialog bind:showModal={showPaginationDialog}>
				<div class="pagination-dialog">
					<label>
						<span>{m.channels_pagination_page()}</span>
						<input
							type="number"
							min="1"
							max={totalPages || undefined}
							value={paginationInitialPage}
							autofocus
							onchange={(e) => {
								const n = parseInt(/** @type {HTMLInputElement} */ (e.target).value)
								if (n >= 1) {
									setPage(n)
									showPaginationDialog = false
								}
							}}
						/>
					</label>
					<label>
						<span>{m.channels_pagination_per_page()}</span>
						<input
							type="number"
							min="1"
							max="200"
							value={pageSize}
							onchange={(e) => setPageSize(parseInt(/** @type {HTMLInputElement} */ (e.target).value))}
						/>
					</label>
				</div>
			</Dialog>
		{/if}

		{#if searchHref}
			<SearchInput bind:value={searchValue} debounce={300} placeholder={m.search_placeholder()} />
		{/if}

		<PopoverMenu
			id="channels-display"
			closeOnClick={false}
			style="margin-left: auto;"
			triggerAttachment={tooltip({content: m.channels_view_mode({mode: viewLabelMap[display]()})})}
		>
			{#snippet trigger()}<Icon icon={viewIconMap[display]} strokeWidth={1.7} />
				{viewLabelMap[display]()}{/snippet}
			<menu class="view-modes">
				<button
					class:active={display === 'grid'}
					onclick={() => setDisplay('grid')}
					{@attach tooltip({content: m.channels_tooltip_grid()})}
					><Icon icon="grid" strokeWidth={1.7} /><small>{m.channels_view_label_grid()}</small></button
				>
				<button
					class:active={display === 'list'}
					onclick={() => setDisplay('list')}
					{@attach tooltip({content: m.channels_tooltip_list()})}
					><Icon icon="unordered-list" /><small>{m.channels_view_label_list()}</small></button
				>
				<button
					class:active={display === 'map'}
					onclick={() => setDisplay('map')}
					{@attach tooltip({content: m.channels_tooltip_map()})}
					><Icon icon="map" strokeWidth={1.7} /><small>{m.channels_view_label_map()}</small></button
				>
				<button
					class:active={display === 'tuner'}
					onclick={() => setDisplay('tuner')}
					{@attach tooltip({content: m.channels_tooltip_tuner()})}
					><Icon icon="radio" /><small>{m.channels_view_label_tuner()}</small></button
				>
				<button
					class:active={display === 'infinite'}
					onclick={() => setDisplay('infinite')}
					{@attach tooltip({content: m.channels_tooltip_infinite()})}
					><Icon icon="box-3d" /><small>{m.channels_view_label_infinite()}</small></button
				>
			</menu>
			{#if filter !== 'featured'}
				<SortControls
					bind:order={appState.channels_order}
					bind:direction={appState.channels_order_direction}
					onreshuffle={() => {
						paginatedLimit = CHANNELS_PAGE_SIZE
						fetchedUpTo = CHANNELS_PAGE_SIZE
						loadedAll = false
						nextPageSize = CHANNELS_PAGE_SIZE
						queryClient.invalidateQueries({
							predicate: (q) => q.queryKey[0] === 'channels' && q.queryKey.includes('shuffle')
						})
					}}
				/>
			{/if}
		</PopoverMenu>
	</menu>

	{#if display === 'map'}
		{#await import('./map-channels.svelte') then MapChannels}
			<MapChannels.default {channels} {openSlug} loading={loadingMore} />
		{/await}
	{:else if display === 'tuner'}
		<SpectrumScanner {channels} />
	{:else if display === 'infinite'}
		{#await import('./infinite-canvas-ogl.svelte') then InfiniteCanvas}
			<InfiniteCanvas.default
				media={canvasMedia}
				activeId={activeChannelId}
				activeIds={activeChannelIds}
				selectedId={selectedCanvasChannelId}
				focusSlug={openSlug}
				focusKey={openSlug}
				onclick={handleCanvasClick}
				ondoubleclick={handleCanvasDoubleClick}
			/>
		{/await}
	{:else}
		<ol class={display}>
			{#each orderedChannels as channel (channel.id)}
				<li>
					<ChannelCard {channel} />
				</li>
			{/each}
		</ol>
		{#if !isPaged}
			<footer>
				{#if orderedChannels.length > 0}
					<p>
						{m.channels_summary({
							visible: orderedChannels.length,
							total: channels.length
						})}
						{#if hasMore}
							<button onclick={handleLoadMore} disabled={loadingMore}>
								{loadingMore ? '...' : m.channels_load_more({count: nextPageSize})}
							</button>
						{/if}
					</p>
				{/if}
			</footer>
		{/if}
	{/if}
</div>

<style>
	.layout {
		position: relative;
		&.layout--map,
		&.layout--infinite {
			display: flex;
			flex-direction: column;
			flex-grow: 1;
		}
		&.layout--infinite :global(.canvas-wrapper) {
			flex: 1;
		}
		&.layout--infinite .filtermenu,
		&.layout--map .filtermenu {
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			/* Default page controls layer: above content, below app overlays/fullscreen deck. */
			z-index: 3;
		}
	}

	.filtermenu {
		position: sticky;
		top: 0.5rem;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0.5rem 0.5rem 1rem;
		z-index: 1;
	}

	footer p {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin: 2rem 0.5rem 1rem;
	}

	.filtermenu :global(.search-input) {
		flex: 1 1 0;
		min-width: 6rem;
	}

	.pagination {
		display: flex;
		align-items: center;
		gap: 0.25rem;

		.page-label {
			min-width: 2rem;
			text-align: center;
			font-variant-numeric: tabular-nums;
			font-size: var(--font-2);
			background: none;
			border: none;
			cursor: pointer;
			padding: 0.1rem 0.3rem;
			border-radius: var(--border-radius, 4px);
			&:hover {
				background: var(--gray-3);
			}
		}
	}

	.pagination-dialog {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.5rem 0;

		label {
			display: flex;
			align-items: center;
			gap: 0.5rem;

			span {
				min-width: 4rem;
				font-size: var(--font-3);
				color: light-dark(var(--gray-10), var(--gray-8));
			}

			input[type='number'] {
				width: 5rem;
				text-align: center;
			}
		}
	}
</style>
