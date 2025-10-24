<script>
	import TrackCard from '$lib/components/track-card.svelte'

	/** @typedef {import('$lib/types').Track} Track */

	/** @type {{
		tracks?: Track[],
		ids?: string[],
		footer?: (props: {track: Track}) => any,
		grouped?: boolean,
		canEdit?: boolean
		}}
	*/
	const {tracks, ids, footer, grouped = false, canEdit = false} = $props()

	/** @type {Track[]}*/
	let internalTracks = $state([])

	import {SvelteMap} from 'svelte/reactivity'

	/** @type {SvelteMap<string, SvelteMap<string, Track[]>>} */
	let groupedTracks = $derived.by(() => {
		if (!grouped || !internalTracks.length) return new SvelteMap()

		const groups = new SvelteMap()
		internalTracks.forEach((track) => {
			const date = new Date(track.created_at)
			const year = date.getFullYear().toString()
			const month = date.toLocaleString('en', {month: 'long'})

			if (!groups.has(year)) {
				groups.set(year, new SvelteMap())
			}
			const yearGroup = groups.get(year)

			if (!yearGroup.has(month)) {
				yearGroup.set(month, [])
			}
			yearGroup.get(month).push(track)
		})

		return groups
	})

	$effect(() => {
		if (tracks) {
			internalTracks = tracks
			return
		}

		if (!ids || ids.length === 0) {
			internalTracks = []
			return
		}

		// 	// Turn the list of ids into real tracks.
		// 	return incrementalLiveQuery(
		// 		`
		// 	SELECT *
		// 	FROM tracks_with_meta
		// 	WHERE id IN (select unnest($1::uuid[]))
		// 	ORDER BY created_at desc
		// `,
		// 		[ids],
		// 		'id',
		// 		(res) => {
		// 			internalTracks = res.rows
		// 		}
		// 	)
	})
</script>

{#if internalTracks.length}
	{#if grouped}
		<div class="timeline">
			{#each groupedTracks as [year, months] (year)}
				<section>
					<h2 caps>{year}</h2>
					{#each months as [month, monthTracks] (month)}
						<section class="month">
							<h3 caps>{month}</h3>
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
			{#each internalTracks as track, index (track.id)}
				<li>
					<TrackCard {track} {index} {canEdit} />
					{@render footer?.({track})}
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	li {
		/*
		contain: content;
		content-visibility: auto;
		 */
		contain-intrinsic-height: auto 3rem;
	}

	section {
		contain: layout style;
		content-visibility: auto;
	}

	.month {
		margin-bottom: 1rem;
	}

	h2,
	h3 {
		margin-left: 0.5rem;
		font-weight: 600;
	}

	/* sticky year */
	h2 {
		display: inline-flex;
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--gray-1);
	}
</style>
