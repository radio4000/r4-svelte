<script>
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list'
	import TrackCard from '$lib/components/track-card.svelte'
	import {SvelteMap} from 'svelte/reactivity'

	/** @typedef {import('$lib/types').Track} Track */
	/** @typedef {{type: 'year' | 'month' | 'track', value?: string, data?: Track, index?: number, id: string}} FlatItem */

	/** @type {{
		tracks: Track[],
		footer?: (props: {track: Track}) => any,
		grouped?: boolean,
		canEdit?: boolean,
		virtual?: boolean
		}}
	*/
	const {tracks, footer, grouped = false, canEdit = false, virtual = false} = $props()

	// Cache key to avoid recomputing when tracks haven't changed
	let cacheKey = $derived(`${tracks.length}-${tracks[0]?.id}-${tracks[tracks.length - 1]?.id}`)

	/** @type {{key: string, items: FlatItem[], groups: SvelteMap<string, SvelteMap<string, Track[]>>}} */
	let cache = {key: '', items: [], groups: new SvelteMap()}

	/** @type {SvelteMap<string, SvelteMap<string, Track[]>>} */
	let groupedTracks = $derived.by(() => {
		if (!grouped || !tracks.length) return new SvelteMap()
		if (cache.key === cacheKey) return cache.groups

		// Build groups with plain Map first (faster), convert to SvelteMap at end
		/** @type {Map<string, Map<string, Track[]>>} */
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const groups = new Map()
		for (const track of tracks) {
			const date = new Date(track.created_at)
			const year = date.getFullYear().toString()
			const month = date.toLocaleString('en', {month: 'long'})

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
			monthTracks.push(track)
		}

		// Convert to SvelteMap for reactivity in non-virtual template
		const svelteGroups = new SvelteMap([...groups].map(([year, months]) => [year, new SvelteMap(months)]))
		cache.groups = svelteGroups
		return svelteGroups
	})

	/** @type {FlatItem[]} */
	let flatItems = $derived.by(() => {
		if (!tracks.length) return []
		if (cache.key === cacheKey && cache.items.length) return cache.items

		if (!grouped) {
			const items = tracks.map((t, i) => ({type: /** @type {const} */ ('track'), data: t, index: i, id: t.id}))
			cache = {key: cacheKey, items, groups: cache.groups}
			return items
		}

		/** @type {FlatItem[]} */
		const items = []
		let trackIndex = 0
		for (const [year, months] of groupedTracks) {
			items.push({type: 'year', value: year, id: `year-${year}`})
			for (const [month, monthTracks] of months) {
				items.push({type: 'month', value: month, id: `month-${year}-${month}`})
				for (const track of monthTracks) {
					items.push({type: 'track', data: track, index: trackIndex++, id: track.id})
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
					{:else if item.data}
						<div class="virtual-item track-item">
							<TrackCard track={item.data} index={item.index} {canEdit} />
							{@render footer?.({track: item.data})}
						</div>
					{/if}
				{/snippet}
			</SvelteVirtualList>
		</div>
	{:else if grouped}
		<div class="timeline">
			{#each groupedTracks as [year, months] (year)}
				<section>
					<h2 class="caps">{year}</h2>
					{#each months as [month, monthTracks] (month)}
						<section class="month">
							<h3 class="caps">{month}</h3>
							<ul class="list tracks">
								{#each monthTracks as track, index (track.id)}
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
	.month {
		margin-bottom: 1rem;
	}

	h2,
	h3 {
		margin-right: 0.5rem;
		font-weight: 600;
		text-align: right;
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

	.virtual-tracklist {
		display: flex;
		flex-direction: column;
		height: calc(100vh - 350px);
		height: calc(100dvh - 350px);
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

	.year-item {
		padding: 0.5rem 0;
	}

	.month-item {
		padding: 0.25rem 0;
	}
</style>
