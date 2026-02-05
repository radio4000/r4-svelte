<script>
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list'
	import TrackCard from '$lib/components/track-card.svelte'
	import {SvelteMap} from 'svelte/reactivity'
	import {getLocale} from '$lib/paraglide/runtime'

	/** @typedef {import('$lib/types').Track} Track */
	/** @typedef {{track: Track, index: number}} IndexedTrack */

	/** @typedef {{type: 'year' | 'month' | 'track', value?: string, track?: Track, index?: number, id: string}} FlatItem */

	/** @type {{
		tracks: Track[],
		footer?: (props: {track: Track}) => any,
		grouped?: boolean,
		canEdit?: boolean,
		virtual?: boolean
		}}
	*/
	const {tracks, footer, grouped = false, canEdit = false, virtual = false} = $props()

	/**
	 * Build localized month names array (0-11) for current locale
	 * @param {string} locale
	 */
	function getLocalizedMonths(locale) {
		const formatter = new Intl.DateTimeFormat(locale, {month: 'long'})
		return Array.from({length: 12}, (_, i) => formatter.format(new Date(2024, i, 1)))
	}

	// Rebuild month names when locale changes
	const months = $derived(getLocalizedMonths(getLocale()))

	// Cache key to avoid recomputing when tracks haven't changed
	let cacheKey = $derived(`${tracks.length}-${tracks[0]?.id}-${tracks.at(-1)?.id}`)

	/** @type {{key: string, items: FlatItem[], groups: SvelteMap<string, SvelteMap<string, IndexedTrack[]>>}} */
	let cache = {key: '', items: [], groups: new SvelteMap()}

	/** @type {SvelteMap<string, SvelteMap<string, IndexedTrack[]>>} */
	let groupedTracks = $derived.by(() => {
		if (!grouped || !tracks.length) return new SvelteMap()
		if (cache.key === cacheKey) return cache.groups

		// Build groups with plain Map first (faster), convert to SvelteMap at end
		/** @type {Map<string, Map<string, IndexedTrack[]>>} */
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const groups = new Map()
		let index = 0
		for (const track of tracks) {
			// Extract year/month from ISO string (fast, avoids Date object creation)
			const year = track.created_at.slice(0, 4)
			const monthIndex = parseInt(track.created_at.slice(5, 7), 10) - 1
			const month = months[monthIndex]

			let yearGroup = groups.get(year)
			if (!yearGroup) {
				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				yearGroup = new Map()
				groups.set(year, yearGroup)
			}

			let monthTracks = yearGroup.get(month)
			if (!monthTracks) {
				monthTracks = []
				yearGroup.set(month, monthTracks)
			}
			monthTracks.push({track, index: index++})
		}

		// Convert to SvelteMap for reactivity in template
		const svelteGroups = new SvelteMap(Array.from(groups, ([year, months]) => [year, new SvelteMap(months)]))
		cache.groups = svelteGroups
		return svelteGroups
	})

	/** @type {FlatItem[]} */
	let flatItems = $derived.by(() => {
		if (!tracks.length) return []
		if (cache.key === cacheKey && cache.items.length) return cache.items

		if (!grouped) {
			const items = tracks.map((track, index) => ({
				type: /** @type {const} */ ('track'),
				track,
				index,
				id: track.id
			}))
			cache = {key: cacheKey, items, groups: cache.groups}
			return items
		}

		/** @type {FlatItem[]} */
		const items = []
		for (const [year, monthsMap] of groupedTracks) {
			items.push({type: 'year', value: year, id: `year-${year}`})
			for (const [month, monthTracks] of monthsMap) {
				items.push({type: 'month', value: month, id: `month-${year}-${month}`})
				for (const {track, index} of monthTracks) {
					items.push({type: 'track', track, index, id: track.id})
				}
			}
		}
		cache = {key: cacheKey, items, groups: cache.groups}
		return items
	})
</script>

{#if tracks.length}
	{#if virtual}
		<div class="virtual-tracklist">
			<SvelteVirtualList
				items={flatItems}
				defaultEstimatedItemHeight={72}
				bufferSize={20}
				viewportClass="virtual-viewport"
			>
				{#snippet renderItem(item)}
					{#if item.type === 'year'}
						<div class="virtual-item year-item">
							<h2 class="caps">{item.value}</h2>
						</div>
					{:else if item.type === 'month'}
						<div class="virtual-item month-item">
							<h3 class="caps">{item.value}</h3>
						</div>
					{:else if item.track}
						<div class="virtual-item track-item">
							<TrackCard track={item.track} index={item.index} {canEdit} />
							{@render footer?.({track: item.track})}
						</div>
					{/if}
				{/snippet}
			</SvelteVirtualList>
		</div>
	{:else if grouped}
		<div class="timeline">
			{#each groupedTracks as [year, months] (year)}
				<section class="year">
					<h2 class="caps">{year}</h2>
					{#each months as [month, monthTracks] (month)}
						<section class="month">
							<h3 class="caps">{month}</h3>
							<ul class="list tracks">
								{#each monthTracks as item (item.track.id)}
									{@const track = item.track}
									{@const index = item.index}
									<li>
										<TrackCard {track} {index} {canEdit} />
										{@render footer?.({track})}
									</li>
								{/each}
							</ul>
						</section>
					{/each}
				</section>
			{/each}
		</div>
	{:else}
		<ul class="list tracks">
			{#each tracks as track, index (track.id)}
				<li>
					<TrackCard {track} {index} {canEdit} />
					{@render footer?.({track})}
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	h2,
	h3 {
		line-height: 1.2;
		margin-right: 0.5rem;
		text-align: right;
	}

	.timeline .list > li:first-child {
		border-top: 1px solid var(--gray-4);
	}

	/* sticky year - only for non-virtual timeline */
	.timeline h2 {
		display: flex;
		justify-content: flex-end;
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--gray-1);
	}

	.timeline > section {
		margin-top: 0.5rem;
	}

	.month:not(:first-of-type) {
		margin-top: 0.5rem;
	}

	.month > h3 {
		margin-bottom: 0.5rem;
	}

	.virtual-tracklist {
		display: flex;
		flex-direction: column;
		/*
		height: calc(100vh - 350px);
		height: calc(100dvh - 350px);
		 */
		height: 100dvh;
		min-height: 400px;
		overflow: hidden;
	}

	.virtual-tracklist :global(.svelte-virtual-list-container) {
		flex: 1;
		min-height: 0;
	}

	:global(.virtual-viewport) {
		height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.virtual-item {
		box-sizing: border-box;
	}
</style>
