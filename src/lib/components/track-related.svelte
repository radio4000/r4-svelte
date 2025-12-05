<script>
	import {tracksCollection} from '../../routes/tanstack/collections'
	import {extractYouTubeId} from '$lib/utils'
	import * as m from '$lib/paraglide/messages'

	let {track} = $props()

	// Find other tracks with same YouTube video ID
	const relatedTracks = $derived.by(() => {
		if (!track?.url) return []
		const ytid = extractYouTubeId(track.url)
		if (!ytid) return []
		return [...tracksCollection.state.values()]
			.filter((t) => t.id !== track.id && extractYouTubeId(t.url) === ytid)
			.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
	})
</script>

{#if relatedTracks.length > 0}
	<p>{m.track_related_heading()}</p>
	<dl>
		{#each relatedTracks as related (related.id)}
			<dt>
				<a href="/{related.slug}/tracks/{related.id}">
					{related.title}
				</a>
			</dt>
			<dd>
				{m.track_related_by()} <a href="/{related.slug}">@{related.slug}</a>
			</dd>
		{/each}
	</dl>
{:else}
	<p>{m.track_related_empty()}</p>
{/if}

<style>
	a {
		color: var(--accent-9);
	}
</style>
