<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {capabilities} from '#lib/modes.js'
	import {appState} from '#lib/app-state.svelte.js'
	import {getFollowedChannels} from '#lib/followed-channels.svelte.js'
	import {broadcastsCollection} from '#lib/collections/broadcasts.js'
	import {channelsCollection} from '#lib/collections/channels.js'
	import {queryClient} from '#lib/collections/query-client.js'
	import {cacheReady} from '#lib/query-cache-persistence.js'
	import {fetchChannelCount, CHANNELS_PAGE_SIZE} from '#lib/collections/channels.js'
	import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
	import {getChannelActivity} from '#lib/channel-activity.svelte.js'
	import {toChannelCardMedia} from '#lib/components/channel-ui-state.ts'
	import {
		handleCanvasClick as onCanvasClick,
		handleCanvasDoubleClick
	} from '#lib/components/channels-view-shared.js'
	import {gte, inArray, not, isNull} from '@tanstack/db'
	import {paginationFromUrl, shuffleSeed} from '#lib/utils.js'
	import {pickFeatured, dailySeed} from '#lib/collections/featured.js'
	import ChannelCard from './channel-card.svelte'
	import ChannelsViewControls from './channels-view-controls.svelte'
	import Dialog from './dialog.svelte'
	import Pagination from './pagination.svelte'
	import Icon from './icon.svelte'
	import SearchInput from './search-input.svelte'
	import SpectrumScanner from './spectrum-scanner.svelte'
	import ExplorePageHeader from './explore-page-header.svelte'
	import {tooltip} from '#lib/components/tooltip-attachment.svelte.js'
	import * as m from '#lib/paraglide/messages.js'

	const channelActivity = $derived(getChannelActivity())

	const {
		display: initialDisplay = undefined,
		defaultFilter = 'featured',
		filter: filterProp = undefined,
		filterBasePath = undefined,
		searchHref = undefined,
		// Collections are browser-only, so a server render has nothing to list. Pass a
		// page of channels from `load` and it renders those until the live query syncs.
		initialChannels = undefined,
		initialCount = 0
	} = $props()

	let searchValue = $state('')
	const follows = getFollowedChannels()
	$effect(() => {
		const q = searchValue.trim()
		if (!q || !searchHref) return
		goto(`${searchHref}?q=${encodeURIComponent(q)}`, {replace: true})
	})

	const filterSlugMap = {
		featured: 'featured',
		all: 'all',
		favorites: 'favorites',
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
		favorites: () => m.nav_favorites(),
		broadcasting: () => m.channels_filter_option_broadcasting(),
		imported: () => m.channels_filter_option_imported(),
		'10+': () => m.channels_filter_option_10(),
		'100+': () => m.channels_filter_option_100(),
		'1000+': () => m.channels_filter_option_1000(),
		artwork: () => m.channels_filter_option_artwork(),
		featured: () => m.channels_filter_option_featured()
	}

	let showFeaturedInfo = $state(false)

	// Featured rotation: daily-seeded shuffle of a quality window so /featured
	// rotates each day instead of always showing the same 12. Reshuffle button
	// swaps the seed for instant on-demand variety.
	const FEATURED_WINDOW = 40
	const FEATURED_COUNT = 12
	let featuredSeed = $state(dailySeed())

	let paginatedLimit = $state(CHANNELS_PAGE_SIZE)
	let extraPages = $state(0)

	const pagination = $derived(paginationFromUrl(page.url, 12))
	const currentPage = $derived(pagination.page)
	const pageSize = $derived(pagination.per)
	const filter = $derived(
		filterProp && filterProp in filterLabelMap
			? filterProp
			: appState.channels_filter in filterLabelMap
				? appState.channels_filter
				: defaultFilter
	)
	const order = $derived(appState.channels_order || 'shuffle')
	const orderDirection = $derived(appState.channels_order_direction)

	const VALID_DISPLAYS = new Set(['grid', 'list', 'map', 'tuner', 'infinite'])
	/** @type {'grid' | 'list' | 'map' | 'tuner' | 'infinite'}*/
	const display = $derived.by(() => {
		const urlDisplay = page.url.searchParams.get('display')
		if (urlDisplay && VALID_DISPLAYS.has(urlDisplay)) return /** @type {any} */ (urlDisplay)
		if (VALID_DISPLAYS.has(appState.channels_display)) return appState.channels_display
		if (VALID_DISPLAYS.has(initialDisplay)) return initialDisplay
		return 'grid'
	})

	// Keep display in URL in sync
	$effect(() => {
		if (!page.url.searchParams.has('display')) {
			const query = new URL(page.url.href).searchParams
			query.set('display', display)
			goto(`?${query.toString()}`, {replace: true, reset: false})
		}
	})

	const isPaged = $derived(display === 'grid' || display === 'list')

	/** Minimum channel count for views that need a dense dataset */
	const VIEW_MIN_LIMIT = {infinite: 400, tuner: 400, map: 5000}
	const queryLimit = $derived(
		filter === 'featured'
			? 50
			: isPaged
				? (currentPage + extraPages) * pageSize
				: Math.max(VIEW_MIN_LIMIT[display] ?? 0, paginatedLimit)
	)
	const favoriteIds = $derived(follows.followedIds)

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

	// Reset pagination when filter/sort/page changes
	$effect(() => {
		void filter
		void order
		void orderDirection
		void currentPage
		paginatedLimit = CHANNELS_PAGE_SIZE
		extraPages = 0
	})

	/** @type {Record<string, () => string[]>} Filters whose total count comes from a local ID list */
	const localIdFilters = {
		favorites: () => favoriteIds,
		broadcasting: () => broadcastIds,
		imported: () => appState.local_channel_ids ?? []
	}

	// Fetch channels driven by the active filter + sort.
	// No deps array needed — Svelte auto-tracks reactive reads in the callback.
	const channelsQuery = useLiveQuery((q) => {
		let base = q.from({ch: channelsCollection})
		if (!capabilities.globalBrowse) {
			return base.orderBy(({ch}) => ch.created_at, 'desc').limit(queryLimit)
		}
		const localIds = localIdFilters[filter]?.()
		if (localIds) {
			if (!localIds.length) return base.orderBy(({ch}) => ch.created_at, 'asc').limit(0)
			base = base.where(({ch}) => inArray(ch.id, localIds))
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
				base = base.orderBy(
					({ch}) => ch[col],
					order === 'shuffle' ? 'asc' : orderDirection || 'desc'
				)
			}
		}
		base = base.limit(queryLimit)
		return base
	})
	const channelsRaw = $derived(channelsQuery.data ?? [])
	// For featured: take a quality window by score, then daily-seeded shuffle down
	// to 12 so it rotates; paged views slice locally; otherwise all
	const channels = $derived.by(() => {
		if (filter === 'featured')
			return pickFeatured(channelsRaw, {
				count: FEATURED_COUNT,
				window: FEATURED_WINDOW,
				seed: featuredSeed
			})
		if (isPaged)
			return channelsRaw.slice((currentPage - 1) * pageSize, (currentPage + extraPages) * pageSize)
		return channelsRaw
	})
	const hasMore = $derived(filter !== 'featured' && !isPaged && channelsRaw.length >= queryLimit)

	// Server-side total count for pagination (N/M display)
	let serverCount = $state(0)
	// Without a total, `Pagination` can't tell there's a next page and renders nothing,
	// so `initialCount` covers the server render and the gap before the count lands.
	const totalCount = $derived(localIdFilters[filter]?.().length ?? (serverCount || initialCount))
	const hasPaginatedMore = $derived(
		isPaged &&
			filter !== 'featured' &&
			(totalCount > 0
				? totalCount > (currentPage + extraPages) * pageSize
				: channelsRaw.length >= (currentPage + extraPages) * pageSize)
	)
	$effect(() => {
		if (!isPaged || filter === 'featured' || filter in localIdFilters) {
			serverCount = 0
			return
		}
		serverCount = 0
		void fetchChannelCount({
			trackCountGte: filterMinTracks[filter],
			imageNotNull: filter === 'artwork',
			coordinatesNotNull: display === 'map',
			shuffle: order === 'shuffle'
		})
			.then((n) => {
				serverCount = n
			})
			.catch(() => {})
	})

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
				/** @type {import('#lib/types.js').Channel[]} */
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
					appState.local_channel_ids = (appState.local_channel_ids ?? []).filter(
						(id) => !stillMissingSet.has(id)
					)
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

	function handleLoadMore() {
		paginatedLimit += CHANNELS_PAGE_SIZE
	}

	let stableChannels = $state(/** @type {typeof channels} */ ([]))
	$effect(() => {
		// Keep showing the previous page while the next one loads
		if (!channelsQuery.isLoading && channels.length > 0) stableChannels = channels
	})
	const live = $derived(isPaged ? stableChannels : channels)
	// `live` is empty on the server and on the first client render, before effects run,
	// so the server's page fills in and the rendered list survives hydration.
	const orderedChannels = $derived(live.length ? live : (initialChannels ?? []))

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
		const query = new URL(page.url.href).searchParams
		query.set('display', value)
		query.delete('page')
		// Preserve map params if switching to map view
		if (value !== 'map') {
			query.delete('latitude')
			query.delete('longitude')
			query.delete('zoom')
		}
		goto(`?${query.toString()}`, {replace: true, reset: false})
	}

	function setFilter(value) {
		appState.channels_filter = value
		if (filterBasePath) {
			goto(resolve(/** @type {any} */ (filterBasePath + '/' + slugFor(value))))
			return
		}
		const query = new URL(page.url.href).searchParams
		query.set('filter', value)
		query.delete('page')
		goto(`?${query.toString()}`, {replace: true, reset: false})
	}
</script>

<div class={`layout layout--${display}`}>
	<ExplorePageHeader>
		{#snippet filterChips()}
			<button
				class="btn chip"
				class:active={filter === 'featured'}
				onclick={() => setFilter('featured')}>{m.channels_filter_option_featured()}</button
			>
			{#if follows.followedIds.length}
				<button
					class="btn chip"
					class:active={filter === 'favorites'}
					onclick={() => setFilter('favorites')}>{m.nav_favorites()}</button
				>
			{/if}
			{#if broadcastIds.length}
				<button
					class="btn chip"
					class:active={filter === 'broadcasting'}
					onclick={() => setFilter('broadcasting')}
					>{m.channels_filter_option_broadcasting()}<span class="channel-badge"
						>{broadcastIds.length}</span
					></button
				>
			{/if}
			<button class="btn chip" class:active={filter === '10+'} onclick={() => setFilter('10+')}
				>{m.channels_filter_option_10()}</button
			>
			<button class="btn chip" class:active={filter === '100+'} onclick={() => setFilter('100+')}
				>{m.channels_filter_option_100()}</button
			>
			<button class="btn chip" class:active={filter === '1000+'} onclick={() => setFilter('1000+')}
				>{m.channels_filter_option_1000()}</button
			>
			<button class="btn chip" class:active={filter === 'all'} onclick={() => setFilter('all')}
				>{m.channels_filter_option_all()}</button
			>
			<button
				class="btn chip"
				class:active={filter === 'artwork'}
				onclick={() => setFilter('artwork')}>{m.channels_filter_option_artwork()}</button
			>
			{#if appState.local_channel_ids?.length}
				<button
					class="btn chip"
					class:active={filter === 'imported'}
					onclick={() => setFilter('imported')}>{m.channels_filter_option_imported()}</button
				>
			{/if}
		{/snippet}
		{#if searchHref}
			<SearchInput
				bind:value={searchValue}
				debounce={300}
				placeholder={m.channels_search_placeholder()}
			/>
		{/if}

		{#if filter === 'featured'}
			<button
				class="btn"
				onclick={() => (featuredSeed = shuffleSeed())}
				aria-label={m.home_featured_refresh()}
				{@attach tooltip({content: m.home_featured_refresh()})}
			>
				<Icon icon="switch-alt" />
			</button>
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
			<button class="btn" onclick={handleLoadMore} disabled={channelsQuery.isLoading}>
				{channelsQuery.isLoading ? '…' : m.channels_load_more({count: CHANNELS_PAGE_SIZE})}
			</button>
		{/if}

		{#if isPaged && filter !== 'featured'}
			<Pagination
				{currentPage}
				{pageSize}
				{totalCount}
				resultCount={orderedChannels.length}
				defaultPageSize={12}
			/>
		{/if}

		<ChannelsViewControls
			{display}
			{setDisplay}
			bind:order={appState.channels_order}
			bind:direction={appState.channels_order_direction}
			showSort={filter !== 'featured'}
			onreshuffle={() => {
				paginatedLimit = CHANNELS_PAGE_SIZE
			}}
		/>
	</ExplorePageHeader>

	{#if display === 'map'}
		{#await import('./map-channels.svelte') then MapChannels}
			<MapChannels.default
				{channels}
				{openSlug}
				loading={channelsQuery.isLoading}
				globeMode={true}
			/>
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
		{#if isPaged && hasPaginatedMore}
			<div class="load-more-wrap">
				<button class="btn" onclick={() => extraPages++} disabled={channelsQuery.isLoading}>
					{channelsQuery.isLoading ? '…' : m.channels_load_more({count: pageSize})}
				</button>
			</div>
		{/if}
		{#if !isPaged}
			<footer>
				{#if orderedChannels.length > 0}
					<p>
						{m.channels_summary({
							visible: orderedChannels.length,
							total: channels.length
						})}
						{#if hasMore}
							<button onclick={handleLoadMore} disabled={channelsQuery.isLoading}>
								{channelsQuery.isLoading
									? '...'
									: m.channels_load_more({count: CHANNELS_PAGE_SIZE})}
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
		&.layout--infinite,
		&.layout--tuner {
			padding: 0;
			display: flex;
			flex-direction: column;
			flex-grow: 1;
			min-height: 0;
		}
		&.layout--infinite :global(.canvas-wrapper) {
			flex: 1;
		}
		&.layout--tuner :global(.scanner) {
			flex: 1;
			min-height: 0;
		}
	}

	.load-more-wrap {
		display: flex;
		justify-content: center;
		padding: 1rem 0.5rem;
	}

	footer p {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin: 2rem 0.5rem 1rem;
	}
</style>
