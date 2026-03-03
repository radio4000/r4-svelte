<script>
	import {getTracksQueryCtx} from '$lib/contexts'
	import {Tween} from 'svelte/motion'
	import {cubicOut} from 'svelte/easing'
	import {page} from '$app/state'
	import {channelsCollection} from '$lib/collections/channels'
	import {getChannelTags} from '$lib/utils'
	import InputRange from '$lib/components/input-range.svelte'
	import Tag from '$lib/components/tag.svelte'
	import Icon from '$lib/components/icon.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import * as m from '$lib/paraglide/messages'

	let slug = $derived(page.params.slug)

	// Get tracks from layout (query stays alive during navigation)
	const tracksQuery = getTracksQueryCtx()

	let channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))
	let tracks = $derived(tracksQuery.data || [])

	let filter = $state('all')
	let timePeriod = $state('year')
	let currentPeriod = $state(0)
	let sort = $state('count') // 'count' | 'alpha'
	let display = $state('list') // 'list' | 'cloud'
	let search = $state('')

	const displayIconMap = {list: 'unordered-list', cloud: 'tag'}
	const displayLabelMap = {list: () => m.channels_view_label_list(), cloud: () => 'Cloud'}

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

	// Tag aggregation from track.tags
	function aggregateTags(trackList, startDate, endDate) {
		const filtered = trackList.filter((track) => {
			const trackDate = new Date(track.created_at)
			if (startDate && trackDate < startDate) return false
			if (endDate && trackDate >= endDate) return false
			return true
		})
		return getChannelTags(filtered)
	}

	// Tags for current period
	let periodTags = $derived.by(() => {
		if (currentPeriod === 0 || !periods.length) {
			return aggregateTags(tracks, null, null)
		}
		const period = periods[currentPeriod - 1]
		return aggregateTags(tracks, period.startDate, period.endDate)
	})

	// Apply filter
	let filteredTags = $derived.by(() => {
		if (filter === 'all') return periodTags
		if (filter === 'single-use') return periodTags.filter((t) => t.count === 1)
		if (filter === 'frequent') return periodTags.filter((t) => t.count >= 5)
		if (filter === 'rare') return periodTags.filter((t) => t.count >= 1 && t.count <= 4)
		return periodTags
	})

	// Apply sort — maxCount always from count-sorted filteredTags (not affected by sort)
	let maxCount = $derived(filteredTags[0]?.count ?? 1)

	let sortedTags = $derived.by(() => {
		if (sort === 'alpha') return filteredTags.toSorted((a, b) => a.value.localeCompare(b.value))
		return filteredTags // already sorted by count desc from getChannelTags
	})

	// Apply name search — final list rendered
	let visibleTags = $derived.by(() => {
		const q = search.trim().toLowerCase()
		if (!q) return sortedTags
		return sortedTags.filter((t) => t.value.includes(q))
	})

	// Track count for the current period (denominator for count display)
	let periodTrackCount = $derived.by(() => {
		if (currentPeriod === 0 || !periods.length) return tracks.length
		const period = periods[currentPeriod - 1]
		return tracks.filter((t) => {
			const d = new Date(t.created_at)
			return d >= period.startDate && d < period.endDate
		}).length
	})

	// Reset period when time period changes
	function onTimePeriodChange() {
		currentPeriod = 0
	}

	let currentPeriodLabel = $derived(
		currentPeriod === 0 ? m.tags_all_time() : periods[currentPeriod - 1]?.label || m.tags_all_time()
	)

	// Animated tag count
	const tagCount = new Tween(0, {duration: 400, easing: cubicOut})
	$effect(() => {
		tagCount.set(visibleTags.length)
	})
</script>

{#if !channel}
	<p style="padding: 1rem;">{m.channel_not_found()}</p>
{:else}
	<main>
		<menu class="filtermenu">
			<SearchInput bind:value={search} placeholder={m.tracks_filter_placeholder()} />
			<PopoverMenu align="end" closeOnClick={false} style="margin-left: auto;">
				{#snippet trigger()}<Icon icon={displayIconMap[display]} /> {displayLabelMap[display]()}{/snippet}
				<menu class="nav-vertical">
					<button class:active={filter === 'all'} onclick={() => (filter = 'all')}>{m.tags_filter_all()}</button>
					<button class:active={filter === 'single-use'} onclick={() => (filter = 'single-use')}
						>{m.tags_filter_single()}</button
					>
					<button class:active={filter === 'frequent'} onclick={() => (filter = 'frequent')}
						>{m.tags_filter_frequent()}</button
					>
					<button class:active={filter === 'rare'} onclick={() => (filter = 'rare')}>{m.tags_filter_rare()}</button>
				</menu>
				<menu class="view-modes">
					<button class:active={display === 'list'} onclick={() => (display = 'list')}>
						<Icon icon="unordered-list" /><small>{m.channels_view_label_list()}</small>
					</button>
					<button class:active={display === 'cloud'} onclick={() => (display = 'cloud')}>
						<Icon icon="tag" /><small>Cloud</small>
					</button>
				</menu>
				<div class="sort-row">
					<select bind:value={timePeriod} onchange={onTimePeriodChange}>
						<option value="year">{m.tags_period_years()}</option>
						<option value="solstice">{m.tags_period_solstices()}</option>
						<option value="month">{m.tags_period_months()}</option>
					</select>
					<select bind:value={sort}>
						<option value="count">Count</option>
						<option value="alpha">A–Z</option>
					</select>
				</div>
			</PopoverMenu>
		</menu>

		{#if periods.length > 0}
			<div class="scrubber">
				<h3><span>{currentPeriodLabel}</span><span class="count">({Math.round(tagCount.current)})</span></h3>
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
			{#if display === 'list'}
				<ol class="list">
					{#each visibleTags as { value, count } (value)}
						<li>
							<Tag href={`/${channel.slug}/tracks?tags=${encodeURIComponent(value)}`} {value}>{value}</Tag>
							<span class="count">{count} / {periodTrackCount}</span>
							<span class="bar" style="--pct: {((count / maxCount) * 100).toFixed(1)}%"></span>
						</li>
					{/each}
				</ol>
			{:else}
				<div class="cloud">
					{#each visibleTags as { value, count } (value)}
						<span style="font-size: calc(0.8rem + {((count / maxCount) * 0.9).toFixed(2)}rem)">
							<Tag href={`/${channel.slug}/tracks?tags=${encodeURIComponent(value)}`} {value}>{value}</Tag>
						</span>
					{/each}
				</div>
			{/if}
		{:else}
			<p>{m.tags_empty()}</p>
		{/if}
	</main>
{/if}

<style>
	.filtermenu {
		position: sticky;
		top: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.5rem 0.5rem 1rem;
		z-index: 1;
	}

	.filtermenu :global(.search-input) {
		flex: 1;
		min-width: 0;
	}

	.filtermenu :global(.search-input input) {
		width: 100%;
	}

	.sort-row {
		display: flex;
		gap: 0.25rem;
		margin-top: 0.25rem;
	}

	.sort-row select {
		flex: 1;
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
		padding: 0.25rem 0;
	}

	.list .count {
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
		gap: 0.5rem;
		padding: 1rem 0.5rem;
		align-items: baseline;
	}
</style>
