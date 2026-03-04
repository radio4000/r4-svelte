<script lang="ts">
	import {setPlaylist, playTrack} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import {buildTagGraph} from '$lib/utils'

	type Tag = {value: string; count: number}
	type Track = {id: string; tags?: string[] | null}

	/** @type {{tags: Tag[], tracks: Track[], channelSlug: string}} */
	const {tags = [], tracks = [], channelSlug = ''} = $props()

	let chain: string[] = $state([])

	/** Compute tag co-occurrence graph */
	let tagGraph = $derived(buildTagGraph(tracks, {minEdgeWeight: 1, maxTags: 500}))

	/** Get tags that co-occur with current chain (branches) */
	let availableBranches = $derived.by((): Set<string> | null => {
		if (chain.length === 0) return null

		const branchSet = new Set<string>()
		const chainLower = chain.map((t) => t.toLowerCase())

		for (const edge of tagGraph.edges) {
			const sourceLower = edge.source.toLowerCase()
			const targetLower = edge.target.toLowerCase()

			// If one end is in chain, add the other end
			if (chainLower.includes(sourceLower) && !chainLower.includes(targetLower)) {
				branchSet.add(edge.target)
			} else if (chainLower.includes(targetLower) && !chainLower.includes(sourceLower)) {
				branchSet.add(edge.source)
			}
		}

		return branchSet
	})

	/** Get tracks matching chain (AND logic) */
	let matchingTracks = $derived(
		chain.length === 0
			? tracks
			: tracks.filter((t) => chain.every((tag) => t.tags?.some((tTag) => tTag.toLowerCase() === tag.toLowerCase())))
	)

	/** Filtered tags: show branches when chain has selection, filter out branches with 0 tracks */
	let visibleTags = $derived.by(() => {
		if (chain.length === 0) return tags

		// If no branches, show nothing (dead end)
		if (!availableBranches || availableBranches.size === 0) return []

		// Show branches that have tracks
		const branchTags = tags.filter((t) => availableBranches.has(t.value.toLowerCase()))
		return branchTags
	})

	/** Toggle tag in/out of chain */
	function toggleTag(tag) {
		if (chain.includes(tag)) {
			chain = chain.filter((t) => t !== tag)
		} else {
			chain = [...chain, tag]
		}
	}

	/** Remove single tag from chain */
	function removeTag(tag) {
		chain = chain.filter((t) => t !== tag)
	}

	/** Clear entire chain */
	function clearChain() {
		chain = []
	}

	/** Play matching tracks */
	async function playChain() {
		if (matchingTracks.length === 0) return
		const trackIds = matchingTracks.map((t) => t.id)
		const deckId = appState.active_deck_id
		setPlaylist(deckId, trackIds)
		await playTrack(deckId, trackIds[0], null, 'user_click_track')
	}
</script>

<div class="tag-chain">
	{#if chain.length > 0}
		<div class="chain-bar">
			<div class="chain-tags">
				{#each chain as tag, i (tag)}
					{#if i > 0}<span class="sep">→</span>{/if}
					<button class="chain-tag" onclick={() => removeTag(tag)}>
						{tag} <span aria-hidden="true">×</span>
					</button>
				{/each}
			</div>
			<div class="chain-actions">
				<button class="play-btn" onclick={playChain} disabled={matchingTracks.length === 0}> ▶ Play </button>
				<a href="/{channelSlug}/tracks?tags={chain.map(encodeURIComponent).join(',')}" class="view-link">
					View {matchingTracks.length} tracks
				</a>
				<button class="clear-btn" onclick={clearChain} aria-label="Clear chain">✕</button>
			</div>
		</div>
	{/if}

	<ol class="tag-list">
		{#each visibleTags as { value, count } (value)}
			<li>
				<button type="button" class="tag-link" class:in-chain={chain.includes(value)} onclick={() => toggleTag(value)}>
					{value}
				</button>
				<span class="count">{count}</span>
			</li>
		{/each}
	</ol>
</div>

<style>
	.tag-chain {
		margin: 0.5rem;
	}

	.chain-bar {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--gray-5);
		border: 1px solid var(--gray-7);
		border-radius: var(--border-radius);
		padding: 0.75rem;
		margin-bottom: 1rem;
	}

	.chain-tags {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
	}

	.sep {
		color: var(--gray-9);
		font-size: 0.875rem;
	}

	.chain-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		background: var(--accent-9);
		color: var(--gray-1);
		border: none;
		border-radius: calc(var(--border-radius) * 999);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.chain-tag:hover {
		background: var(--accent-10);
	}

	.chain-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.play-btn {
		padding: 0.375rem 0.75rem;
		background: var(--accent-9);
		color: var(--gray-1);
		border: none;
		border-radius: var(--border-radius);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.play-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.play-btn:hover:not(:disabled) {
		background: var(--accent-10);
	}

	.view-link {
		font-size: 0.875rem;
		color: var(--accent-9);
		text-decoration: none;
	}

	.view-link:hover {
		text-decoration: underline;
	}

	.clear-btn {
		padding: 0.375rem 0.5rem;
		background: transparent;
		color: var(--gray-11);
		border: 1px solid var(--gray-7);
		border-radius: var(--border-radius);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.clear-btn:hover {
		background: var(--gray-4);
	}

	.tag-list {
		list-style: decimal;
		padding-left: 1.5rem;
		margin: 0;
	}

	.tag-list li {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--gray-4);
	}

	.tag-list li:last-child {
		border-bottom: none;
	}

	.tag-link {
		background: none;
		border: none;
		font: inherit;
		color: var(--link-color, var(--accent-9));
		cursor: pointer;
		text-decoration: none;
		padding: 0;
	}

	.tag-link:hover {
		text-decoration: underline;
	}

	.tag-link.in-chain {
		color: var(--accent-9);
		font-weight: 600;
	}

	.count {
		color: var(--gray-10);
		font-size: 0.875rem;
		margin-left: auto;
	}
</style>
