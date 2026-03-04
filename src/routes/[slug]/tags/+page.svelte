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
	import * as m from '$lib/paraglide/messages'

	let slug = $derived(page.params.slug ?? '')

	// Get tracks from layout (query stays alive during navigation)
	const tracksQuery = getTracksQueryCtx()

	let channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))
	let tracks = $derived(tracksQuery.data || [])

	const filterValues = ['all', 'single-use', 'frequent', 'rare']
	const periodValues = ['year', 'solstice', 'month']
	const displayValues = ['list', 'cloud', 'chain']
	const sortValues = ['count', 'alpha']

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

	const readSearchParam = () => page.url.searchParams.get('search') ?? ''

	let filter = $state(readEnumParam('filter', filterValues, 'all'))
	let timePeriod = $state(readEnumParam('timePeriod', periodValues, 'year'))
	let currentPeriod = $state(readPeriodParam())
	let display = $state(readEnumParam('display', displayValues, 'list'))
	let sort = $state(readEnumParam('sort', sortValues, 'count'))
	let chainTags = $state(readTagsParam())
	let search = $state(readSearchParam())

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

	const sortLabelMap = {
		count: () => 'Count',
		alpha: () => 'A–Z'
	}

	const displayIconMap = {list: 'unordered-list', cloud: 'tag', chain: 'code-branch'}
	const displayLabelMap = {list: () => 'List', cloud: () => 'Cloud', chain: () => 'Chain'}

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

	let periodTags = $derived.by(() => {
		return getChannelTags(periodTracks)
	})

	// Apply filter
	let filteredTags = $derived.by(() => {
		let tags = periodTags
		if (filter === 'single-use') tags = tags.filter((t) => t.count === 1)
		else if (filter === 'frequent') tags = tags.filter((t) => t.count >= 5)
		else if (filter === 'rare') tags = tags.filter((t) => t.count >= 1 && t.count <= 4)

		// Apply sort
		if (sort === 'alpha') {
			return tags.toSorted((a, b) => a.value.localeCompare(b.value))
		}
		return tags // count is already sorted from getChannelTags
	})

	let visibleTags = $derived.by(() => {
		const query = search.trim().toLowerCase()
		if (!query) return filteredTags
		return filteredTags.filter((tag) => tag.value.includes(query))
	})

	let maxVisibleTagCount = $derived(visibleTags.reduce((max, tag) => Math.max(max, tag.count), 1))

	// Track count for current period
	let periodTrackCount = $derived(periodTracks.length)

	let currentPeriodLabel = $derived(
		currentPeriod === 0 ? m.tags_all_time() : periods[currentPeriod - 1]?.label || m.tags_all_time()
	)

	// Animated tag count
	const tagCount = new Tween(0, {duration: 400, easing: cubicOut})
	$effect(() => {
		tagCount.set(visibleTags.length)
	})

	$effect(() => {
		if (currentPeriod <= periods.length) return
		currentPeriod = periods.length
	})

	$effect(() => {
		const parts = []
		if (display !== 'list') parts.push(`display=${encodeURIComponent(display)}`)
		if (sort !== 'count') parts.push(`sort=${encodeURIComponent(sort)}`)
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
	<main>
		<menu class="filtermenu">
			<SearchInput bind:value={search} placeholder="Search tags…" />

			<PopoverMenu id="tags-data" closeOnClick={false}>
				{#snippet trigger()}<Icon icon="filter" /><span>Data</span>{/snippet}
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
				{#snippet trigger()}<Icon icon="sort" />{sortLabelMap[sort]()}{/snippet}
				<menu class="nav-vertical">
					<button class:active={sort === 'count'} onclick={() => (sort = 'count')}>
						{sortLabelMap.count()}
					</button>
					<button class:active={sort === 'alpha'} onclick={() => (sort = 'alpha')}>
						{sortLabelMap.alpha()}
					</button>
				</menu>
			</PopoverMenu>

			<PopoverMenu id="tags-display" closeOnClick={false} style="margin-left: auto;">
				{#snippet trigger()}<Icon icon={displayIconMap[display]} />{displayLabelMap[display]()}{/snippet}
				<menu class="view-modes">
					<button class:active={display === 'list'} onclick={() => (display = 'list')}>
						<Icon icon="unordered-list" /><small>List</small>
					</button>
					<button class:active={display === 'cloud'} onclick={() => (display = 'cloud')}>
						<Icon icon="tag" /><small>Cloud</small>
					</button>
					<button class:active={display === 'chain'} onclick={() => (display = 'chain')}>
						<Icon icon="code-branch" /><small>Chain</small>
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
		{:else if visibleTags.length > 0}
			{#if display === 'chain'}
				<TagChain
					tags={visibleTags}
					tracks={periodTracks}
					totalCount={periodTrackCount}
					channelSlug={channel.slug}
					bind:chainTags
				/>
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
				<ol class="list">
					{#each visibleTags as { value, count } (value)}
						<li>
							<span class="tag">
								<a href={resolve('/[slug]/tracks', {slug}) + `?tags=${encodeURIComponent(value)}`}>
									{value}
								</a>
							</span>
							<span class="count">{count} / {periodTrackCount}</span>
							<span
								class="bar"
								style="--pct: {periodTrackCount ? ((count / periodTrackCount) * 100).toFixed(1) : '0.0'}%"
							></span>
						</li>
					{/each}
				</ol>
			{/if}
		{:else}
			<p>{m.tags_empty()}</p>
		{/if}
	</main>
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

	.filtermenu :global(.search-input) {
		flex: 1;
		min-width: 0;
	}

	.filtermenu :global(.search-input input) {
		width: 100%;
	}

	.scrubber {
		margin: 1rem 0.5rem 1rem;
		padding: 1rem;
		background: var(--gray-5);
		border-radius: var(--border-radius);
		border: 1px solid var(--gray-7);
	}

	.scrubber h3 {
		display: flex;
		justify-content: space-between;
		font-weight: bold;
		margin-bottom: 0.5rem;
	}

	.scrubber h3 .count {
		font-variant-numeric: tabular-nums;
	}

	.scrubber .scrubber-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.scrubber .scrubber-meta select {
		flex: 0 1 auto;
		max-width: 100%;
	}

	.scrubber-labels {
		display: flex;
		justify-content: space-between;
		margin-top: 0.5rem;
	}

	.scrubber-labels span {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.scrubber-labels span.active {
		color: var(--accent-9);
	}

	@media (max-width: 640px) {
		.scrubber-labels {
			display: none;
		}
	}

	.list {
		margin: 0 0.5rem;
	}

	.list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.25rem;
		border-bottom: 1px solid var(--gray-4);
	}

	.list li:first-child {
		border-top: 1px solid var(--gray-4);
	}

	.list .tag {
		flex: 0 0 auto;
	}

	.list .count {
		flex: 0 0 auto;
		font-variant-numeric: tabular-nums;
		color: var(--gray-11);
		font-size: 0.85em;
		min-width: 2ch;
		text-align: right;
	}

	.bar {
		flex: 1;
		height: 2px;
		background: linear-gradient(to left, var(--accent-6) var(--pct), var(--gray-7) var(--pct));
		border-radius: 1px;
		align-self: center;
	}

	.cloud {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.625rem;
		margin: 0.5rem;
		line-height: 1.35;
	}

	.cloud a {
		text-decoration: none;
	}

	.cloud a:hover {
		text-decoration: underline;
	}
</style>
