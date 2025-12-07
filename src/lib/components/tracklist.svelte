<script>
	import TrackCard from '$lib/components/track-card.svelte'
	import {SvelteMap} from 'svelte/reactivity'

	/** @typedef {import('$lib/types').Track} Track */

	/** @type {{
		tracks: Track[],
		footer?: (props: {track: Track}) => any,
		grouped?: boolean,
		canEdit?: boolean
		}}
	*/
	const {tracks, footer, grouped = false, canEdit = false} = $props()

	/** @type {SvelteMap<string, SvelteMap<string, Track[]>>} */
	let groupedTracks = $derived.by(() => {
		if (!grouped || !tracks.length) return new SvelteMap()

		const groups = new SvelteMap()
		tracks.forEach((track) => {
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
</script>

{#if tracks.length}
	{#if grouped}
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
	li {
		/*
		contain: content;
		content-visibility: auto;
		 */
		/* contain-intrinsic-height: auto 3rem; */
	}

	section {
		/* contain: layout style; */
		/* content-visibility: auto; */
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
