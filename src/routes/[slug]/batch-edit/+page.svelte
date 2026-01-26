<script>
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {eq} from '@tanstack/db'
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list'
	import fuzzysort from 'fuzzysort'
	import {page} from '$app/state'
	import {
		channelsCollection,
		tracksCollection,
		trackMetaCollection,
		updateTrack,
		insertDurationFromMeta
	} from '$lib/tanstack/collections'
	import {pull as pullYouTubeMeta} from '$lib/metadata/youtube'
	import {extractYouTubeId} from '$lib/utils'
	import {appState} from '$lib/app-state.svelte'
	import TrackRow from './track-row.svelte'
	import BatchActionBar from './batch-action-bar.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	let slug = $derived(page.params.slug)

	const channelQuery = useLiveQuery((q) =>
		q
			.from({channels: channelsCollection})
			.where(({channels}) => eq(channels.slug, slug))
			.orderBy(({channels}) => channels.created_at, 'desc')
			.limit(1)
	)

	const tracksQuery = useLiveQuery((q) =>
		q
			.from({tracks: tracksCollection})
			.where(({tracks}) => eq(tracks.slug, slug))
			.orderBy(({tracks}) => tracks.created_at, 'desc')
	)

	const metaQuery = useLiveQuery((q) => q.from({meta: trackMetaCollection}).orderBy(({meta}) => meta.ytid))

	let channel = $derived(channelQuery.data?.[0])
	let rawTracks = $derived(tracksQuery.data || [])
	let metaMap = $derived(new Map(metaQuery.data?.map((m) => [m.ytid, m]) || []))
	/** @type {import('$lib/types').TrackWithMeta[]} */
	let tracks = $derived(
		rawTracks.map((track) => {
			const ytid = extractYouTubeId(track.url)
			if (!ytid) return track
			const meta = metaMap.get(ytid)
			return meta ? {...track, ...meta} : track
		})
	)
	const readonly = $derived(channel?.source === 'v1')
	const canEdit = $derived(!readonly && appState.channels?.includes(channel?.id))

	/** @type {string[]} */
	let selectedTracks = $state([])
	let filter = $state('all')
	let tagFilter = $state('')
	let mentionFilter = $state('')
	let search = $state('')
	let fetchingMeta = $state(false)
	let fetchProgress = $state({current: 0, total: 0})

	// All tracks missing YouTube metadata
	let allTracksMissingMeta = $derived(tracks.filter((t) => !t.youtube_data && !t.playback_error))

	async function fetchAllMeta() {
		if (fetchingMeta || allTracksMissingMeta.length === 0 || !channel) return
		fetchingMeta = true
		fetchProgress = {current: 0, total: 0}
		try {
			const ytids = allTracksMissingMeta.map((t) => extractYouTubeId(t.url)).filter((id) => id !== null)
			await pullYouTubeMeta(ytids, {
				onProgress: ({current, total}) => {
					fetchProgress = {current, total}
				}
			})
			await insertDurationFromMeta(channel, allTracksMissingMeta)
		} finally {
			fetchingMeta = false
			fetchProgress = {current: 0, total: 0}
		}
	}

	// Column visibility
	const ALL_COLUMNS = [
		'url',
		'title',
		'description',
		'tags',
		'mentions',
		'discogs',
		'duration',
		'meta',
		'error',
		'created',
		'updated'
	]
	const COLUMN_WIDTHS = {
		url: '1fr',
		title: '2fr',
		description: '2fr',
		tags: '1fr',
		mentions: '1fr',
		discogs: '2fr',
		meta: '80px',
		duration: '60px',
		error: '80px',
		created: '90px',
		updated: '90px'
	}
	let hiddenColumns = $state(['url', 'discogs', 'tags', 'mentions'])
	let gridTemplate = $derived(
		'40px 40px ' +
			ALL_COLUMNS.filter((c) => !hiddenColumns.includes(c))
				.map((c) => COLUMN_WIDTHS[c])
				.join(' ')
	)

	// Focus state for tab navigation
	/** @type {string | null} */
	let focusedTrackId = $state(null)
	/** @type {string | null} */
	let focusedField = $state(null)

	/** @type {'title' | 'description' | 'tags' | 'mentions' | 'created_at' | 'updated_at' | 'duration' | 'error' | 'meta' | null} */
	let sortBy = $state(null)
	let sortDir = $state('asc')

	const filterLabels = {
		all: 'All tracks',
		'missing-description': 'Missing description',
		'no-tags': 'No tags',
		'single-tag': 'Single tag',
		'no-meta': 'No metadata',
		'has-meta': 'Has metadata',
		'has-t-param': 'Has &t= param',
		'has-error': 'Has error',
		'has-duration': 'Has duration',
		'no-duration': 'No duration',
		'meta-no-duration': 'Meta but no duration'
	}

	const sortKey = {
		title: (t) => t.title?.toLowerCase() ?? '',
		description: (t) => t.description?.toLowerCase() ?? '',
		tags: (t) => t.tags?.length ?? 0,
		mentions: (t) => t.mentions?.length ?? 0,
		created_at: (t) => t.created_at ?? '',
		updated_at: (t) => t.updated_at ?? '',
		duration: (t) => t.duration ?? 0,
		error: (t) => (t.playback_error ? 1 : 0),
		meta: (t) => (t.youtube_data ? 1 : 0) + (t.musicbrainz_data ? 1 : 0) + (t.discogs_data ? 1 : 0)
	}

	function toggleSort(column) {
		if (sortBy === column) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc'
		} else {
			sortBy = column
			sortDir = 'asc'
		}
	}

	function handleFocusChange(trackId, field) {
		if (field === 'next-row' || field === 'prev-row') {
			const currentIndex = filteredTracks.findIndex((t) => t.id === focusedTrackId)
			const nextIndex = field === 'next-row' ? currentIndex + 1 : currentIndex - 1
			if (nextIndex >= 0 && nextIndex < filteredTracks.length) {
				focusedTrackId = filteredTracks[nextIndex].id
				focusedField = field === 'next-row' ? 'url' : 'discogs_url'
			} else {
				focusedTrackId = null
				focusedField = null
			}
		} else {
			focusedTrackId = trackId
			focusedField = field
		}
	}

	/** @param {import('$lib/types').Track[]} items @param {'tags' | 'mentions'} field */
	function countByField(items, field) {
		const counts = {}
		for (const item of items) {
			for (const val of item[field] || []) {
				counts[val] = (counts[val] || 0) + 1
			}
		}
		return Object.entries(counts)
			.map(([value, count]) => ({value, count}))
			.sort((a, b) => b.count - a.count)
	}

	let allTags = $derived(countByField(tracks, 'tags'))
	let allMentions = $derived(countByField(tracks, 'mentions'))

	let selectedCount = $derived(selectedTracks.length)
	let hasSelection = $derived(selectedCount > 0)

	let filteredTracks = $derived.by(() => {
		if (!tracks) return []

		// First apply dropdown filter
		let result = tracks.filter((track) => {
			switch (filter) {
				case 'has-t-param':
					return track.url?.includes('&t=')
				case 'missing-description':
					return !track.description?.trim()
				case 'no-tags':
					return !track.tags?.length
				case 'single-tag':
					return track.tags?.length === 1
				case 'no-meta':
					return !track.title && !track.description
				case 'has-meta':
					return track.title || track.description
				case 'has-error':
					return !!track.playback_error
				case 'has-duration':
					return (track.duration ?? 0) > 0
				case 'no-duration':
					return !track.duration
				case 'meta-no-duration':
					return !track.duration && track.youtube_data?.duration
				default:
					return true
			}
		})

		// Apply tag filter
		if (tagFilter) {
			result = result.filter((track) => (track.tags || []).includes(tagFilter))
		}

		// Apply mention filter
		if (mentionFilter) {
			result = result.filter((track) => (track.mentions || []).includes(mentionFilter))
		}

		// Then apply search filter
		if (search.trim().length >= 2) {
			const results = fuzzysort.go(search, result, {
				keys: ['title', 'description', 'url'],
				threshold: 0.5
			})
			result = results.map((r) => r.obj)
		}

		// Apply sorting
		if (sortBy) {
			result = [...result].sort((a, b) => {
				const av = sortKey[sortBy](a)
				const bv = sortKey[sortBy](b)
				const cmp = av < bv ? -1 : av > bv ? 1 : 0
				return sortDir === 'asc' ? cmp : -cmp
			})
		}

		return result
	})

	function selectTrack(trackId, event) {
		if (event.shiftKey && selectedTracks.length > 0) {
			const trackIndex = filteredTracks.findIndex((t) => t.id === trackId)
			const lastSelected = selectedTracks[selectedTracks.length - 1]
			const lastIndex = filteredTracks.findIndex((t) => t.id === lastSelected)

			const start = Math.min(trackIndex, lastIndex)
			const end = Math.max(trackIndex, lastIndex)

			const rangeIds = []
			for (let i = start; i <= end; i++) {
				rangeIds.push(filteredTracks[i].id)
			}
			selectedTracks = [...new Set([...selectedTracks, ...rangeIds])]
		} else if (event.ctrlKey || event.metaKey) {
			if (selectedTracks.includes(trackId)) {
				selectedTracks = selectedTracks.filter((id) => id !== trackId)
			} else {
				selectedTracks = [...selectedTracks, trackId]
			}
		} else {
			selectedTracks = [trackId]
		}
	}

	function selectAll() {
		selectedTracks = filteredTracks.map((t) => t.id)
	}

	function clearSelection() {
		selectedTracks = []
	}

	async function onEdit(trackId, field, newValue) {
		if (!channel || !canEdit) return
		const track = tracks.find((t) => t.id === trackId)
		if (!track || track[field] === newValue) return
		await updateTrack(channel, trackId, {[field]: newValue})
	}
</script>

<svelte:head>
	<title>{m.batch_edit_page_title({name: channel?.name || m.channel_page_fallback()})}</title>
</svelte:head>

{#if channelQuery.isLoading}
	<p style="padding: 1rem;">Loading...</p>
{:else if !channel}
	<p style="padding: 1rem;">Channel not found</p>
{:else}
	<header>
		<!-- <p class="hint">
			Double-click to edit cells. Changes save as you edit. Tab to move between cells.<br />
			Hold <kbd>Shift</kbd> or <kbd>ctrl</kbd> to select multiple cells.
		</p> -->
		<menu class="controls">
			<PopoverMenu id="batch-filter">
				{#snippet trigger()}<Icon icon="filter-alt" size="20" /> {filterLabels[filter]}{/snippet}
				<button class:active={filter === 'all'} onclick={() => (filter = 'all')}>All tracks</button>
				<button class:active={filter === 'missing-description'} onclick={() => (filter = 'missing-description')}
					>Missing description</button
				>
				<button class:active={filter === 'no-tags'} onclick={() => (filter = 'no-tags')}>No tags</button>
				<button class:active={filter === 'single-tag'} onclick={() => (filter = 'single-tag')}>Single tag</button>
				<button class:active={filter === 'no-meta'} onclick={() => (filter = 'no-meta')}>No metadata</button>
				<button class:active={filter === 'has-meta'} onclick={() => (filter = 'has-meta')}>Has metadata</button>
				<button class:active={filter === 'has-t-param'} onclick={() => (filter = 'has-t-param')}>Has &t= param</button>
				<button class:active={filter === 'has-error'} onclick={() => (filter = 'has-error')}>Has error</button>
				<button class:active={filter === 'has-duration'} onclick={() => (filter = 'has-duration')}>Has duration</button>
				<button class:active={filter === 'no-duration'} onclick={() => (filter = 'no-duration')}>No duration</button>
				<button class:active={filter === 'meta-no-duration'} onclick={() => (filter = 'meta-no-duration')}
					>Meta but no duration</button
				>
			</PopoverMenu>

			{#if allTags.length > 0}
				<PopoverMenu id="batch-tags">
					{#snippet trigger()}<Icon icon="tag" size="20" /> {tagFilter || 'Tags'}{/snippet}
					<button class:active={!tagFilter} onclick={() => (tagFilter = '')}>All tags</button>
					{#each allTags as { value, count } (value)}
						<button class:active={tagFilter === value} onclick={() => (tagFilter = value)}>{value} ({count})</button>
					{/each}
				</PopoverMenu>
			{/if}

			{#if allMentions.length > 0}
				<PopoverMenu id="batch-mentions">
					{#snippet trigger()}<Icon icon="user" size="20" /> {mentionFilter || 'Mentions'}{/snippet}
					<button class:active={!mentionFilter} onclick={() => (mentionFilter = '')}>All mentions</button>
					{#each allMentions as { value, count } (value)}
						<button class:active={mentionFilter === value} onclick={() => (mentionFilter = value)}
							>{value} ({count})</button
						>
					{/each}
				</PopoverMenu>
			{/if}

			<input type="search" bind:value={search} placeholder="Search..." />

			{#if canEdit && allTracksMissingMeta.length > 0}
				<button
					onclick={fetchAllMeta}
					disabled={fetchingMeta}
					title="Fetch YouTube metadata for all {allTracksMissingMeta.length} tracks missing metadata"
				>
					{fetchingMeta
						? `Fetching... (${fetchProgress.current}/${fetchProgress.total})`
						: `Fetch all meta (${allTracksMissingMeta.length})`}
				</button>
			{/if}

			<PopoverMenu id="batch-display" closeOnClick={false} style="margin-left: auto;">
				{#snippet trigger()}<Icon icon="grid" size="20" strokeWidth={1.7} /> Display{/snippet}
				<div class="sort-row">
					<select bind:value={sortBy}>
						<option value={null}>Sort by...</option>
						<option value="title">Title</option>
						<option value="created_at">Created</option>
						<option value="updated_at">Updated</option>
						<option value="duration">Duration</option>
					</select>
					<button onclick={() => (sortDir = sortDir === 'asc' ? 'desc' : 'asc')}>
						<Icon icon={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size="20" />
					</button>
				</div>
				<!-- <div class="sort-options">
					<button class:active={sortBy === 'title'} onclick={() => toggleSort('title')}>Title</button>
					<button class:active={sortBy === 'created_at'} onclick={() => toggleSort('created_at')}>Created</button>
					<button class:active={sortBy === 'updated_at'} onclick={() => toggleSort('updated_at')}>Updated</button>
					<button class:active={sortBy === 'duration'} onclick={() => toggleSort('duration')}>Duration</button>
				</div>
				<button onclick={() => (sortDir = sortDir === 'asc' ? 'desc' : 'asc')}>
					<Icon icon={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size="20" />
					{sortDir === 'asc' ? 'Ascending' : 'Descending'}
				</button> -->
				<hr />
				<div class="column-options">
					{#each ALL_COLUMNS as col (col)}
						<label>
							<input
								type="checkbox"
								checked={!hiddenColumns.includes(col)}
								onchange={() => {
									if (hiddenColumns.includes(col)) {
										hiddenColumns = hiddenColumns.filter((c) => c !== col)
									} else {
										hiddenColumns = [...hiddenColumns, col]
									}
								}}
							/>
							{col}
						</label>
					{/each}
				</div>
			</PopoverMenu>
		</menu>

		<nav>
			<a href="/{slug}">@{channel.name}</a>
			{m.batch_edit_nav_suffix()}
		</nav>

		{#if readonly}
			<p class="hint warn">READ ONLY, this is a v1 channel</p>
		{:else if !canEdit}
			<p class="hint warn">(READ ONLY, you do not have edit access)</p>
		{/if}
	</header>

	{#if canEdit}
		<BatchActionBar selectedIds={selectedTracks} {channel} {allTags} {tracks} />
	{/if}

	<main class="tracks-container">
		<section class="tracks">
			{#if tracksQuery.isLoading}
				<p>Loading tracks...</p>
			{:else if filteredTracks.length === 0}
				<p>{m.batch_edit_no_tracks()}</p>
			{:else}
				<div class="tracks-list">
					<div class="tracks-header" style:grid-template-columns={gridTemplate}>
						<div class="col-checkbox">
							<input
								type="checkbox"
								checked={selectedCount === filteredTracks.length && filteredTracks.length > 0}
								indeterminate={selectedCount > 0 && selectedCount < filteredTracks.length}
								onchange={hasSelection ? clearSelection : selectAll}
							/>
						</div>
						<div class="col-link"></div>
						{#if !hiddenColumns.includes('url')}<div class="col-url">{m.batch_edit_column_url()}</div>{/if}
						{#if !hiddenColumns.includes('title')}<button
								class="col-title sortable"
								class:sorted={sortBy === 'title'}
								onclick={() => toggleSort('title')}
							>
								{m.batch_edit_column_title()}
								{sortBy === 'title' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
							</button>{/if}
						{#if !hiddenColumns.includes('description')}<button
								class="col-description sortable"
								class:sorted={sortBy === 'description'}
								onclick={() => toggleSort('description')}
							>
								{m.batch_edit_column_description()}
								{sortBy === 'description' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
							</button>{/if}
						{#if !hiddenColumns.includes('tags')}<button
								class="col-tags sortable"
								class:sorted={sortBy === 'tags'}
								onclick={() => toggleSort('tags')}
							>
								{m.batch_edit_column_tags()}
								{sortBy === 'tags' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
							</button>{/if}
						{#if !hiddenColumns.includes('mentions')}<button
								class="col-mentions sortable"
								class:sorted={sortBy === 'mentions'}
								onclick={() => toggleSort('mentions')}
							>
								{m.batch_edit_column_mentions()}
								{sortBy === 'mentions' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
							</button>{/if}
						{#if !hiddenColumns.includes('discogs')}<div class="col-discogs">{m.batch_edit_column_discogs()}</div>{/if}
						{#if !hiddenColumns.includes('duration')}<button
								class="col-duration sortable"
								class:sorted={sortBy === 'duration'}
								onclick={() => toggleSort('duration')}
							>
								{m.batch_edit_column_duration()}
								{sortBy === 'duration' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
							</button>{/if}
						{#if !hiddenColumns.includes('meta')}<button
								class="col-meta sortable"
								class:sorted={sortBy === 'meta'}
								onclick={() => toggleSort('meta')}
							>
								{m.batch_edit_column_meta()}
								{sortBy === 'meta' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
							</button>{/if}
						{#if !hiddenColumns.includes('error')}<button
								class="col-error sortable"
								class:sorted={sortBy === 'error'}
								onclick={() => toggleSort('error')}
							>
								{m.batch_edit_column_error()}
								{sortBy === 'error' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
							</button>{/if}
						{#if !hiddenColumns.includes('created')}<button
								class="col-date sortable"
								class:sorted={sortBy === 'created_at'}
								onclick={() => toggleSort('created_at')}
							>
								{m.batch_edit_column_created()}
								{sortBy === 'created_at' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
							</button>{/if}
						{#if !hiddenColumns.includes('updated')}<button
								class="col-date sortable"
								class:sorted={sortBy === 'updated_at'}
								onclick={() => toggleSort('updated_at')}
							>
								updated {sortBy === 'updated_at' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
							</button>{/if}
					</div>
					<SvelteVirtualList
						items={filteredTracks}
						defaultEstimatedItemHeight={32}
						bufferSize={20}
						viewportClass="virtual-viewport"
					>
						{#snippet renderItem(track)}
							<TrackRow
								{track}
								{slug}
								isSelected={selectedTracks.includes(track.id)}
								onSelect={(e) => selectTrack(track.id, e)}
								{onEdit}
								{canEdit}
								focusedField={focusedTrackId === track.id ? focusedField : null}
								onFocusChange={handleFocusChange}
								{hiddenColumns}
								{gridTemplate}
							/>
						{/snippet}
					</SvelteVirtualList>
				</div>
			{/if}
		</section>
	</main>
{/if}

<style>
	header nav {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
	}

	header menu {
		padding: 0 0.5rem;
		margin-bottom: 0.5rem;
		place-items: center;
	}

	.hint {
		margin: 0 0.5rem 1rem;
	}

	.tracks-header {
		margin-bottom: 0.5rem;
		display: grid;
		gap: 0.5rem;
		position: sticky;
		top: 0;
		z-index: 1;
		padding-right: 17px;
	}

	.tracks-header .col-checkbox {
		text-align: center;
		min-width: 40px;
	}

	.tracks-container {
		min-width: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		height: calc(100vh - 120px);
	}

	.tracks-list {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.tracks-list :global(.svelte-virtual-list-container) {
		flex: 1;
		min-height: 0;
	}

	:global(.virtual-viewport) {
		height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.tracks {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	:global(.col-discogs) {
		border-right: none;
	}

	.sortable {
		&.sorted {
			background: var(--gray-2);
		}
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.5rem;
	}

	.sort-row {
		display: flex;
		gap: 0.25rem;
		padding-bottom: 0.5rem;
		margin-bottom: 0.2rem;
		border-bottom: 1px solid var(--gray-6);
	}

	.sort-row select {
		flex: 1;
	}

	.column-options {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.column-options label {
		display: flex;
		gap: 0.5rem;
		white-space: nowrap;
		padding: 0.2rem;
	}

	.column-options label:hover {
		background: var(--gray-3);
	}

	p.warn {
		background: yellow;
		color: var(--gray-1);
	}
</style>
