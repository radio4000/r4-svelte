<script>
	import {replaceState} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {getTracksQueryCtx} from '$lib/contexts'
	import {Tween} from 'svelte/motion'
	import {cubicOut} from 'svelte/easing'
	import {page} from '$app/state'
	import {channelsCollection} from '$lib/collections/channels'
	import {getChannelTags} from '$lib/utils'
	import InputRange from '$lib/components/input-range.svelte'
	import TagChain from '$lib/components/tag-chain.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import Icon from '$lib/components/icon.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import Subpage from '$lib/components/subpage.svelte'
	import * as m from '$lib/paraglide/messages'

	let slug = $derived(page.params.slug ?? '')

	// Get tracks from layout (query stays alive during navigation)
	const tracksQuery = getTracksQueryCtx()

	let channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))
	let tracks = $derived(tracksQuery.data || [])
	let allTags = $derived(getChannelTags(tracks))

	const filterValues = ['all', 'single-use', 'frequent', 'rare']
	const periodValues = ['year', 'solstice', 'month']
	const displayValues = ['list', 'cloud']
	const sortValues = ['count', 'alpha']
	const directionValues = ['desc', 'asc']

	const readEnumParam = (key, validValues, fallback) => {
		const value = page.url.searchParams.get(key)
		return validValues.includes(value) ? value : fallback
	}

	const readPeriodParam = () => {
		const value = Number(page.url.searchParams.get('period') ?? 0)
		return Number.isInteger(value) && value >= 0 ? value : 0
	}

	const readTagsParam = () => {
		const value = page.url.searchParams.get('tags')
		if (!value) return []
		return value
			.split(',')
			.map((v) => v.trim())
			.filter(Boolean)
	}

	let urlFilter = $derived(readEnumParam('filter', filterValues, 'all'))
	let urlTimePeriod = $derived(readEnumParam('timePeriod', periodValues, 'year'))
	let urlCurrentPeriod = $derived(readPeriodParam())
	let urlDisplay = $derived(readEnumParam('display', displayValues, 'list'))
	let urlSort = $derived(readEnumParam('sort', sortValues, 'count'))
	let urlDirection = $derived(readEnumParam('direction', directionValues, 'desc'))
	let urlTags = $derived(readTagsParam())
	let urlSearch = $derived(page.url.searchParams.get('search') ?? '')

	let filter = $state('all')
	let timePeriod = $state('year')
	let currentPeriod = $state(0)
	let display = $state('list')
	let sort = $state('count')
	let direction = $state('desc')
	let chainTags = $state([])
	let search = $state('')

	const filterLabelMap = {
		all: () => m.tags_filter_all(),
		'single-use': () => m.tags_filter_single(),
		frequent: () => m.tags_filter_frequent(),
		rare: () => m.tags_filter_rare()
	}

	const periodLabelMap = {
		year: () => m.tags_period_years(),
		solstice: () => m.tags_period_solstices(),
		month: () => m.tags_period_months()
	}

	const sortLabelMap = {count: m.tags_sort_count(), alpha: m.tags_sort_alpha()}

	const displayIconMap = {list: 'unordered-list', cloud: 'tag'}
	const displayLabelMap = {list: m.tags_display_list(), cloud: m.tags_display_cloud()}

	// Date range from tracks
	let dateRange = $derived.by(() => {
		if (!tracks.length) return null
		const dates = tracks.map((t) => new Date(t.created_at).getTime())
		return {
			minDate: new Date(Math.min(...dates)),
			maxDate: new Date(Math.max(...dates))
		}
	})

	// Generate time periods based on date range
	let periods = $derived.by(() => {
		if (!dateRange) return []

		const newPeriods = []
		const start = dateRange.minDate
		const end = dateRange.maxDate

		if (timePeriod === 'year') {
			for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
				newPeriods.push({
					label: year.toString(),
					startDate: new Date(year, 0, 1),
					endDate: new Date(year + 1, 0, 1)
				})
			}
		} else if (timePeriod === 'solstice') {
			const solsticeNames = [
				m.tags_solstice_march(),
				m.tags_solstice_june(),
				m.tags_solstice_september(),
				m.tags_solstice_december()
			]
			for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
				for (let q = 0; q < 4; q++) {
					const quarterStart = new Date(year, q * 3, 1)
					const quarterEnd = new Date(year, (q + 1) * 3, 1)
					if (quarterStart <= end && quarterEnd >= start) {
						newPeriods.push({
							label: `${year} ${solsticeNames[q]}`,
							startDate: quarterStart,
							endDate: quarterEnd
						})
					}
				}
			}
		} else if (timePeriod === 'month') {
			let currentYear = start.getFullYear()
			let currentMonth = start.getMonth()
			const endYear = end.getFullYear()
			const endMonth = end.getMonth()

			while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
				const monthStart = new Date(currentYear, currentMonth, 1)
				const monthEnd = new Date(currentYear, currentMonth + 1, 1)
				newPeriods.push({
					label: `${currentYear} ${monthStart.toLocaleDateString('en', {month: 'short'})}`,
					startDate: monthStart,
					endDate: monthEnd
				})
				currentMonth++
				if (currentMonth > 11) {
					currentMonth = 0
					currentYear++
				}
			}
		}

		return newPeriods
	})

	// Tags for current period
	let periodTracks = $derived.by(() => {
		if (currentPeriod === 0 || !periods.length) return tracks
		const period = periods[currentPeriod - 1]
		if (!period) return tracks
		return tracks.filter((track) => {
			const date = new Date(track.created_at)
			return date >= period.startDate && date < period.endDate
		})
	})

	// Chain logic
	let chainLower = $derived(chainTags.map((t) => t.toLowerCase()))

	let matchingTracks = $derived.by(() => {
		if (chainLower.length === 0) return []
		return periodTracks.filter((track) => {
			const trackTags = (track.tags ?? []).map((tag) => tag.toLowerCase())
			return chainLower.every((tag) => trackTags.includes(tag))
		})
	})

	// Base track set: refine by chain when active
	let baseTracks = $derived(chainLower.length > 0 ? matchingTracks : periodTracks)

	let periodTags = $derived(getChannelTags(baseTracks))

	// Apply filter
	let filteredTags = $derived.by(() => {
		// Exclude tags already in the chain
		let tags = periodTags.filter((t) => !chainLower.includes(t.value.toLowerCase()))
		if (filter === 'single-use') tags = tags.filter((t) => t.count === 1)
		else if (filter === 'frequent') tags = tags.filter((t) => t.count >= 5)
		else if (filter === 'rare') tags = tags.filter((t) => t.count >= 1 && t.count <= 4)

		// Apply sort
		if (sort === 'alpha') {
			const sorted = tags.toSorted((a, b) => a.value.localeCompare(b.value))
			return direction === 'asc' ? sorted : sorted.toReversed()
		}
		const sorted = tags.toSorted((a, b) => b.count - a.count || a.value.localeCompare(b.value))
		return direction === 'desc' ? sorted : sorted.toReversed()
	})

	let visibleTags = $derived.by(() => {
		const query = search.trim().toLowerCase()
		if (!query) return filteredTags
		return filteredTags.filter((tag) => tag.value.includes(query))
	})

	let maxVisibleTagCount = $derived(visibleTags.reduce((max, tag) => Math.max(max, tag.count), 1))

	let visibleTrackCount = $derived(baseTracks.length)

	let currentPeriodLabel = $derived(
		currentPeriod === 0 ? m.tags_all_time() : periods[currentPeriod - 1]?.label || m.tags_all_time()
	)

	function toggleTag(tag) {
		const key = tag.toLowerCase()
		if (chainLower.includes(key)) {
			chainTags = chainTags.filter((t) => t.toLowerCase() !== key)
		} else {
			chainTags = [...chainTags, tag]
		}
	}

	// Animated tag count
	const tagCount = new Tween(0, {duration: 400, easing: cubicOut})
	$effect(() => {
		tagCount.set(visibleTags.length)
	})

	// URL is the source of truth. Keep local UI state synced when URL changes.
	$effect(() => {
		filter = urlFilter
		timePeriod = urlTimePeriod
		currentPeriod = urlCurrentPeriod
		display = urlDisplay
		sort = urlSort
		direction = urlDirection
		chainTags = urlTags
		search = urlSearch
	})

	$effect(() => {
		if (!periods.length) return
		if (currentPeriod <= periods.length) return
		currentPeriod = periods.length
	})

	$effect(() => {
		const parts = []
		if (display !== 'list') parts.push(`display=${encodeURIComponent(display)}`)
		if (sort !== 'count') parts.push(`sort=${encodeURIComponent(sort)}`)
		if (direction !== 'desc') parts.push(`direction=${encodeURIComponent(direction)}`)
		if (filter !== 'all') parts.push(`filter=${encodeURIComponent(filter)}`)
		if (timePeriod !== 'year') parts.push(`timePeriod=${encodeURIComponent(timePeriod)}`)
		if (currentPeriod !== 0) parts.push(`period=${currentPeriod}`)
		if (search.trim()) parts.push(`search=${encodeURIComponent(search.trim())}`)
		if (chainTags.length) parts.push(`tags=${chainTags.map(encodeURIComponent).join(',')}`)
		const queryString = parts.length ? `?${parts.join('&')}` : ''
		const basePath = resolve('/[slug]/tags', {slug})
		const nextPath = `${basePath}${queryString}`
		const currentPath = `${page.url.pathname}${page.url.search}`
		if (currentPath !== nextPath) replaceState(resolve('/[slug]/tags', {slug}) + queryString, {})
	})
</script>

{#if !channel}
	<p style="padding: 1rem;">{m.channel_not_found()}</p>
{:else}
	<Subpage
		title={m.channel_tags_link()}
		loading={tracksQuery.isLoading}
		empty={allTags.length === 0}
		emptyText={m.tags_no_tags()}
	>
		<main>
			<menu class="filtermenu">
				<SearchInput bind:value={search} placeholder={m.tags_search_placeholder()} />

				<PopoverMenu id="tags-data" closeOnClick={false}>
					{#snippet trigger()}<Icon icon="filter-alt" />{filterLabelMap[filter]()}{/snippet}
					<menu class="nav-vertical">
						<button class:active={filter === 'all'} onclick={() => (filter = 'all')}>
							{filterLabelMap.all()}
						</button>
						<button class:active={filter === 'single-use'} onclick={() => (filter = 'single-use')}>
							{filterLabelMap['single-use']()}
						</button>
						<button class:active={filter === 'frequent'} onclick={() => (filter = 'frequent')}>
							{filterLabelMap.frequent()}
						</button>
						<button class:active={filter === 'rare'} onclick={() => (filter = 'rare')}>
							{filterLabelMap.rare()}
						</button>
					</menu>
				</PopoverMenu>

				<PopoverMenu id="tags-order" closeOnClick={false}>
					{#snippet trigger()}
						<Icon icon={direction === 'asc' ? 'funnel-ascending' : 'funnel-descending'} strokeWidth={1.5} />
						{sortLabelMap[sort]}
					{/snippet}
					<div class="row">
						<select bind:value={sort} aria-label={m.sort_order_label()}>
							<option value="count">{m.tags_sort_count()}</option>
							<option value="alpha">{m.tags_sort_alpha()}</option>
						</select>
						<button
							type="button"
							onclick={() => {
								direction = direction === 'asc' ? 'desc' : 'asc'
							}}
							title={direction === 'asc' ? m.channels_tooltip_sort_asc() : m.channels_tooltip_sort_desc()}
							aria-label={direction === 'asc' ? m.channels_tooltip_sort_asc() : m.channels_tooltip_sort_desc()}
						>
							<Icon icon={direction === 'asc' ? 'funnel-ascending' : 'funnel-descending'} strokeWidth={1.5} />
						</button>
					</div>
				</PopoverMenu>

				<PopoverMenu id="tags-display" closeOnClick={false} style="margin-left: auto;">
					{#snippet trigger()}<Icon icon={displayIconMap[display]} />{displayLabelMap[display]}{/snippet}
					<menu class="view-modes">
						<button class:active={display === 'list'} onclick={() => (display = 'list')}>
							<Icon icon="unordered-list" /><small>{m.tags_display_list()}</small>
						</button>
						<button class:active={display === 'cloud'} onclick={() => (display = 'cloud')}>
							<Icon icon="tag" /><small>{m.tags_display_cloud()}</small>
						</button>
					</menu>
				</PopoverMenu>
			</menu>

			{#if periods.length > 0}
				<div class="scrubber">
					<h3>
						<span>{currentPeriodLabel}</span>
						<span class="scrubber-meta">
							<span class="count">({Math.round(tagCount.current)})</span>
							<select
								bind:value={timePeriod}
								onchange={() => {
									currentPeriod = 0
								}}
								aria-label={m.tags_period_label()}
							>
								<option value="year">{periodLabelMap.year()}</option>
								<option value="solstice">{periodLabelMap.solstice()}</option>
								<option value="month">{periodLabelMap.month()}</option>
							</select>
						</span>
					</h3>
					<InputRange
						min={0}
						max={periods.length}
						step={1}
						visualStep={timePeriod === 'year'
							? 1
							: timePeriod === 'solstice'
								? Math.max(1, Math.ceil(periods.length / 15))
								: Math.max(1, Math.ceil(periods.length / 25))}
						bind:value={currentPeriod}
						title={m.tags_scrub_title()}
					/>
					<div class="scrubber-labels">
						<span>{m.tags_all_time()}</span>
						{#if periods.length < 20}
							{#each periods as period, i (period.label)}
								<span class:active={currentPeriod === i + 1}>{period.label}</span>
							{/each}
						{:else}
							<span>{periods[0]?.label}</span>
							<span>...</span>
							<span>{periods.at(-1)?.label}</span>
						{/if}
					</div>
				</div>
			{/if}

			{#if tracksQuery.isLoading}
				<p style="margin: 1rem;">{m.channel_loading_tracks()}</p>
			{:else if display === 'cloud'}
				<div class="cloud">
					{#each visibleTags as { value, count } (value)}
						<span
							style="font-size: calc(0.8rem + {maxVisibleTagCount
								? ((count / maxVisibleTagCount) * 0.9).toFixed(2)
								: '0.0'}rem)"
						>
							<a href={resolve('/[slug]/tracks', {slug}) + `?tags=${encodeURIComponent(value)}`}>
								{value}
							</a>
						</span>
					{/each}
				</div>
			{:else}
				<TagChain bind:tags={chainTags} {matchingTracks} channelSlug={channel.slug} />
				{#if visibleTags.length > 0}
					<ol class="list">
						{#each visibleTags as { value, count } (value)}
							<li>
								<button
									class="ghost row"
									class:selected={chainLower.includes(value.toLowerCase())}
									onclick={() => toggleTag(value)}
								>
									<span class="tag-value">{value}</span>
									<span class="count">{count} / {visibleTrackCount}</span>
									<span
										class="bar"
										style="--pct: {visibleTrackCount ? ((count / visibleTrackCount) * 100).toFixed(1) : '0.0'}%"
									></span>
								</button>
							</li>
						{/each}
					</ol>
				{:else}
					<p style="margin: 1rem; text-align: center;">
						{m.tags_empty()}
					</p>
				{/if}
			{/if}
		</main>
	</Subpage>
{/if}

<style>
	.filtermenu {
		margin: 0.5rem 0.5rem 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		position: sticky;
		top: 0.5rem;
		z-index: 1;
	}

	.scrubber {
		margin: 0.5rem 0 0.5rem 0.5rem;
		border: 1px dashed var(--gray-5);
		padding: 0.5rem;
		border-radius: var(--border-radius);

		:global(input[type='range']) {
			accent-color: var(--accent-9);
		}

		h3 {
			display: flex;
			place-items: center;
			justify-content: space-between;
			font-weight: bold;
			margin-bottom: 0.5rem;

			.count {
				font-variant-numeric: tabular-nums;
			}
		}
	}

	.scrubber-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;

		select {
			flex: 0 1 auto;
			max-width: 100%;
		}
	}

	.scrubber-labels {
		display: flex;
		justify-content: space-between;
		margin-top: 0.5rem;

		span {
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;

			&.active {
				color: var(--accent-9);
			}
		}

		@media (max-width: 640px) {
			display: none;
		}
	}

	.list {
		margin-left: 0.5rem;

		li {
			border-bottom: 0;
		}

		button.row {
			width: 100%;
			text-align: left;

			.tag-value {
				min-width: 2ch;
				color: var(--accent-9);
			}
		}

		.count {
			flex: 0 0 auto;
			font-variant-numeric: tabular-nums;
			text-align: right;
		}

		.bar {
			flex: 1;
			height: 4px;
			background: linear-gradient(to left, var(--accent-9) var(--pct), var(--gray-7) var(--pct));
			border-radius: 1px;
			align-self: center;
			transition: height 120ms cubic-bezier(0.19, 1, 0.22, 1);
		}

		li:hover .bar {
			height: 1rem;
		}
	}

	.cloud {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1rem 0.5rem 0.5rem;

		a {
			text-decoration: none;
			color: var(--accent-9);
		}

		a:hover {
			text-decoration: underline;
		}
	}
</style>
