<script lang="ts">
	import {appState} from '$lib/app-state.svelte'
	import {ensureTracksLoaded, tracksCollection} from '$lib/collections/tracks'
	import {computeChannelMatchScore} from '$lib/channel-match-score'

	let sourceSlug = $state(appState.channel?.slug ?? '')
	let targetSlug = $state('')
	let loading = $state(false)
	let error = $state('')

	let sourceTracks = $derived.by(() => {
		void tracksCollection.state.size
		if (!sourceSlug) return []
		return [...tracksCollection.state.values()].filter((t) => t.slug === sourceSlug)
	})
	let targetTracks = $derived.by(() => {
		void tracksCollection.state.size
		if (!targetSlug) return []
		return [...tracksCollection.state.values()].filter((t) => t.slug === targetSlug)
	})
	let score = $derived(computeChannelMatchScore(sourceTracks, targetTracks))

	async function loadBoth() {
		error = ''
		if (!sourceSlug || !targetSlug) return
		loading = true
		try {
			await Promise.all([ensureTracksLoaded(sourceSlug), ensureTracksLoaded(targetSlug)])
		} catch (e) {
			error = e instanceof Error ? e.message : String(e)
		} finally {
			loading = false
		}
	}
</script>

<svelte:head>
	<title>Matching debug</title>
</svelte:head>

<p>Channel matching score debug. Directional: source channel should cover target channel.</p>

<form
	onsubmit={(e) => {
		e.preventDefault()
		void loadBoth()
	}}
>
	<label>
		Source slug (your channel)
		<input bind:value={sourceSlug} placeholder="ko002" />
	</label>
	<label>
		Target slug (viewed channel)
		<input bind:value={targetSlug} placeholder="oskar" />
	</label>
	<button type="submit" disabled={loading}>{loading ? 'Loading…' : 'Load + compute'}</button>
</form>

{#if error}
	<p>{error}</p>
{/if}

<p>
	<strong>Score:</strong> {score.total}%
</p>
<p>
	URL: {Math.round(score.url.ratio * 100)}% ({score.url.overlap}/{score.url.base})
</p>
<p>
	Artist+Title: {Math.round(score.artistTitle.ratio * 100)}%
	({score.artistTitle.overlap}/{score.artistTitle.base})
</p>

<details>
	<summary>Raw breakdown</summary>
	<pre>{JSON.stringify(score, null, 2)}</pre>
</details>
