<script>
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list'
	import TrackCard from '$lib/components/track-card.svelte'
	import ChannelMicroCard from '$lib/components/channel-micro-card.svelte'
	import {listboxNav} from '$lib/components/listbox-nav.svelte'
	import {playTrack, setPlaylist} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import {SvelteMap} from 'svelte/reactivity'
	import {getLocale} from '$lib/paraglide/runtime'
	import * as m from '$lib/paraglide/messages'

	/** @typedef {import('$lib/types').Track} Track */
	/** @typedef {{track: Track, index: number}} IndexedTrack */

	/** @typedef {{type: 'year' | 'month' | 'track', value?: string, track?: Track, index?: number, id: string}} FlatItem */

	/** @type {{
		tracks: Track[],
		playlistTracks?: Track[],  // Overrides tracks for playlist context when rendering a subset (e.g. preview)
		deckId?: number,
		playlistTitle?: string,
		footer?: (props: {track: Track}) => any,
		grouped?: boolean,
		canEdit?: boolean,
		virtual?: boolean,
		playContext?: boolean,
		showSlug?: boolean,
		selectedTrackId?: string | null,
		onSelectTrack?: (trackId: string | null) => void,
		onTagClick?: (tag: string) => void
		}}
	*/
	const {
		tracks,
		playlistTracks,
		deckId,
		playlistTitle,
		footer,
		grouped = false,
		canEdit = false,
		virtual = false,
		playContext = false,
		showSlug = false,
		selectedTrackId: selectedTrackIdProp = null,
		onSelectTrack,
		onTagClick
	} = $props()
	let internalSelectedTrackId = $state(/** @type {string | null} */ (null))
	const selectedTrackId = $derived(selectedTrackIdProp ?? internalSelectedTrackId)

	const selectTrackFromEvent = (event, trackId) => {
		const target = /** @type {HTMLElement} */ (event.target)
		if (target.closest('button, a, input, [role="button"]')) return
		if (onSelectTrack) {
			onSelectTrack(trackId)
		} else {
			internalSelectedTrackId = trackId
		}
	}

	const playFromList = (trackId) => {
		const targetDeck = deckId ?? appState.active_deck_id
		const contextTracks = playlistTracks ?? tracks
		if (playContext && contextTracks.length) {
			setPlaylist(
				targetDeck,
				contextTracks.map((track) => track.id),
				{title: playlistTitle}
			)
		}
		playTrack(targetDeck, trackId, null, 'user_click_track')
	}

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

	/** @type {any} */
	let virtualList = $state()

	/** @param {number} index */
	export function scrollToItem(index) {
		virtualList?.scroll({index, smoothScroll: true, shouldThrowOnBounds: false})
	}

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
		const svelteGroups = new SvelteMap(
			Array.from(groups, ([year, months]) => [year, new SvelteMap(months)])
		)
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
			for (const [month, monthTracks] of monthsMap) {
				items.push({type: 'month', value: `${month} ${year}`, id: `month-${year}-${month}`})
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
		<div class={{'virtual-tracklist': true, 'hide-artwork': appState.hide_track_artwork}}>
			<SvelteVirtualList
				bind:this={virtualList}
				items={flatItems}
				defaultEstimatedItemHeight={72}
				bufferSize={20}
				viewportClass="virtual-viewport"
			>
				{#snippet renderItem(item)}
					{#if item.type === 'month'}
						<div class="virtual-item month-item">
							<h3 class="caps">{item.value}</h3>
						</div>
					{:else if item.track}
						<div
							class={{
								'virtual-item': true,
								'track-item': true,
								'track-with-channel': showSlug,
								'sticky-active':
									deckId != null && appState.decks[deckId]?.playlist_track === item.track?.id
							}}
							role="option"
							tabindex="-1"
							aria-selected={selectedTrackId === item.track?.id}
							onclick={(event) => selectTrackFromEvent(event, item.track?.id)}
						>
							<TrackCard
								track={item.track}
								index={item.index}
								{deckId}
								selected={selectedTrackId === item.track?.id}
								onPlay={playContext ? playFromList : undefined}
								{canEdit}
								showSlug={false}
								{onTagClick}
							/>
							{#if showSlug}<ChannelMicroCard slug={item.track.slug} />{/if}
							{@render footer?.({track: item.track})}
						</div>
					{/if}
				{/snippet}
			</SvelteVirtualList>
		</div>
	{:else if grouped}
		<div
			class={{timeline: true, 'hide-artwork': appState.hide_track_artwork}}
			role="listbox"
			tabindex="0"
			aria-label={m.nav_tracks()}
			{@attach listboxNav({
				onSelect: (_, el) => el.dataset.trackId && playFromList(el.dataset.trackId),
				onChange: (_, el) => {
					const nextId = el.dataset.trackId ?? null
					if (onSelectTrack) onSelectTrack(nextId)
					else internalSelectedTrackId = nextId
				},
				wrap: true,
				selectOnClick: false
			})}
		>
			{#each groupedTracks as [year, months] (year)}
				{#each months as [month, monthTracks] (month)}
					<section class="month">
						<h3 class="caps">{month} {year}</h3>
						<ul class="list tracks">
							{#each monthTracks as item (item.track.id)}
								{@const track = item.track}
								{@const index = item.index}
								<li
									class={{'track-with-channel': showSlug}}
									role="option"
									aria-selected="false"
									id="track-{track.id}"
									data-track-id={track.id}
									onclick={(event) => selectTrackFromEvent(event, track.id)}
								>
									<TrackCard
										{track}
										{index}
										{deckId}
										selected={selectedTrackId === track.id}
										onPlay={playContext ? playFromList : undefined}
										{canEdit}
										showSlug={false}
										{onTagClick}
									/>
									{#if showSlug}<ChannelMicroCard slug={track.slug} />{/if}
									{@render footer?.({track})}
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			{/each}
		</div>
	{:else}
		<ul
			class={{list: true, tracks: true, 'hide-artwork': appState.hide_track_artwork}}
			role="listbox"
			tabindex="0"
			aria-label={m.nav_tracks()}
			{@attach listboxNav({
				onSelect: (_, el) => el.dataset.trackId && playFromList(el.dataset.trackId),
				onChange: (_, el) => {
					const nextId = el.dataset.trackId ?? null
					if (onSelectTrack) onSelectTrack(nextId)
					else internalSelectedTrackId = nextId
				},
				wrap: true,
				selectOnClick: false
			})}
		>
			{#each tracks as track, index (track.id)}
				<li
					class={{'track-with-channel': showSlug}}
					role="option"
					aria-selected="false"
					id="track-{track.id}"
					data-track-id={track.id}
					onclick={(event) => selectTrackFromEvent(event, track.id)}
				>
					<TrackCard
						{track}
						{index}
						{deckId}
						selected={selectedTrackId === track.id}
						onPlay={playContext ? playFromList : undefined}
						{canEdit}
						showSlug={false}
						{onTagClick}
					/>
					{#if showSlug}<ChannelMicroCard slug={track.slug} />{/if}
					{@render footer?.({track})}
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	.track-with-channel {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.35rem;
		padding-inline: 0.5rem;
	}

	.track-with-channel :global(article) {
		flex: 1;
		min-width: 0;
	}

	.track-with-channel :global(.card) {
		padding-inline-start: 0;
	}

	h3 {
		text-align: center;
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
		flex: 1;
		min-height: 0;
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

	.sticky-active {
		position: sticky;
		top: 0;
		bottom: 0;
		z-index: 1;
	}
</style>
