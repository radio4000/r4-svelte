<script>
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {getTracksCollection} from '$lib/collections'
	import {extractYouTubeId} from '$lib/utils'

	let {track} = $props()

	const tracksCollection = getTracksCollection()
	const trackYtid = $derived(track?.url ? extractYouTubeId(track.url) : null)

	// Find other tracks with same ytid using live query
	const relatedQuery = useLiveQuery({
		collection: tracksCollection,
		filter: (t) => {
			if (!trackYtid || !t.url || t.id === track?.id) return false
			return extractYouTubeId(t.url) === trackYtid
		}
	})

	const relatedTracks = $derived(relatedQuery.data || [])
</script>

{#if relatedTracks.length > 0}
	<p>Other tracks using the same YouTube video:</p>
	<dl>
		{#each relatedTracks as related (related.id)}
			<dt>
				<a href="/{related.channel_slug}/tracks/{related.id}">
					{related.title}
				</a>
			</dt>
			<dd>
				by <a href="/{related.channel_slug}">@{related.channel_slug}</a>
			</dd>
		{/each}
	</dl>
{:else}
	<p>No other tracks use this YouTube video.</p>
{/if}

<style>
	a {
		color: var(--accent-9);
	}
</style>
