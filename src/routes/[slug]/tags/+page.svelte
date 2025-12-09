<script>
	import {useLiveQuery, eq} from '@tanstack/svelte-db'
	import {page} from '$app/state'
	import {channelsCollection, tracksCollection} from '../../tanstack/collections'
	import {extractHashtags} from '$lib/utils'
	import InputRange from '$lib/components/input-range.svelte'
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

	let channel = $derived(channelQuery.data?.[0])
	let tracks = $derived(tracksQuery.data || [])

	let filter = $state('all')
	let timePeriod = $state('year')
	let currentPeriod = $state(0)

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
		} else if (timePeriod === 'quarter') {
			for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
				for (let q = 0; q < 4; q++) {
					const quarterStart = new Date(year, q * 3, 1)
					const quarterEnd = new Date(year, (q + 1) * 3, 1)
					if (quarterStart <= end && quarterEnd >= start) {
						newPeriods.push({
							label: `${year} Q${q + 1}`,
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
					label: monthStart.toLocaleDateString('en', {year: 'numeric', month: 'short'}),
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

	// Tag aggregation from track descriptions
	function aggregateTags(trackList, startDate, endDate) {
		const counts = {}
		for (const track of trackList) {
			const trackDate = new Date(track.created_at)
			if (startDate && trackDate < startDate) continue
			if (endDate && trackDate >= endDate) continue
			for (const tag of extractHashtags(track.description || '')) {
				counts[tag] = (counts[tag] || 0) + 1
			}
		}
		return Object.entries(counts)
			.map(([tag, count]) => ({tag, count}))
			.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
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

	// Reset period when time period changes
	function onTimePeriodChange() {
		currentPeriod = 0
	}

	let currentPeriodLabel = $derived(
		currentPeriod === 0 ? m.tags_all_time() : periods[currentPeriod - 1]?.label || m.tags_all_time()
	)
</script>

{#if channelQuery.isLoading}
	<p style="padding: 1rem;">Loading...</p>
{:else if !channel}
	<p style="padding: 1rem;">Channel not found</p>
{:else}
	<main>
		<header class="row">
			<h1>{m.tags_heading({name: channel.name})}</h1>
			<menu>
				<label title={m.tags_filter_label()}>
					<select bind:value={filter}>
						<option value="all">{m.tags_filter_all()}</option>
						<option value="single-use">{m.tags_filter_single()}</option>
						<option value="frequent">{m.tags_filter_frequent()}</option>
						<option value="rare">{m.tags_filter_rare()}</option>
					</select>
				</label>
				<label title={m.tags_period_label()}>
					<select bind:value={timePeriod} onchange={onTimePeriodChange}>
						<option value="year">{m.tags_period_years()}</option>
						<option value="quarter">{m.tags_period_quarters()}</option>
						<option value="month">{m.tags_period_months()}</option>
					</select>
				</label>
			</menu>
		</header>

		{#if periods.length > 0}
			<div class="scrubber">
				<h3>{currentPeriodLabel}</h3>
				<InputRange
					min={0}
					max={periods.length}
					step={1}
					visualStep={timePeriod === 'year'
						? 1
						: timePeriod === 'quarter'
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
						<span>{periods[periods.length - 1]?.label}</span>
					{/if}
				</div>
			</div>
		{/if}

		{#if tracksQuery.isLoading}
			<p style="margin: 1rem;">Loading tracks...</p>
		{:else if filteredTags.length > 0}
			<ol class="list">
				{#each filteredTags as { tag, count } (tag)}
					<li>
						<span class="tag">
							<a href={`/search?search=@${channel.slug} ${tag}`}>
								{tag}
							</a>
						</span>
						<span class="count">{count}</span>
					</li>
				{/each}
			</ol>
			<footer>
				<p>
					{m.tags_showing({count: filteredTags.length})}
					{#if currentPeriodLabel !== m.tags_all_time()}
						<span class="period-context">{m.tags_period_context({label: currentPeriodLabel})}</span>
					{/if}
				</p>
			</footer>
		{:else}
			<p>{m.tags_empty()}</p>
		{/if}
	</main>
{/if}

<style>
	header {
		margin: 0.5rem 0.5rem 0;
		place-items: center;
	}

	.scrubber {
		margin: 1rem 0.5rem 1rem;
		padding: 1rem;
		background: var(--gray-5);
		border-radius: var(--border-radius);
		border: 1px solid var(--gray-7);
	}

	.scrubber h3 {
		text-align: center;
		font-weight: bold;
		margin-bottom: 0.5rem;
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

	.list {
		margin: 0 0.5rem;
	}
</style>
