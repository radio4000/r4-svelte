<script lang="ts">
	import {resolve} from '$app/paths'
	import {setPlaylist, playTrack} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import {getChannelTags} from '$lib/utils'

	interface Tag {
		value: string
		count: number
	}

	interface Track {
		id: string
		tags?: string[] | null
	}

	interface Props {
		tags?: Tag[]
		tracks?: Track[]
		channelSlug?: string
		chainTags?: string[]
		totalCount?: number
	}

	let {tags = [], tracks = [], channelSlug = '', chainTags = $bindable([]), totalCount = 0}: Props = $props()

	let chainLower = $derived(chainTags.map((t) => t.toLowerCase()))

	/** Get tracks matching chain (AND logic) */
	let matchingTracks = $derived.by(() => {
		if (chainLower.length === 0) return []
		return tracks.filter((track) => {
			const trackTags = (track.tags ?? []).map((tag) => tag.toLowerCase())
			return chainLower.every((tag) => trackTags.includes(tag))
		})
	})

	/** Show only branch tags that produce >0 matches with current chain. */
	let visibleTags = $derived.by(() => {
		if (chainTags.length === 0) return tags

		const chainLookup = Object.fromEntries(chainLower.map((tag) => [tag, true]))
		const branchCounts = Object.fromEntries(getChannelTags(matchingTracks).map((tag) => [tag.value, tag.count]))

		return tags
			.filter((tag) => !chainLookup[tag.value.toLowerCase()])
			.map((tag) => ({value: tag.value, count: branchCounts[tag.value.toLowerCase()] ?? 0}))
			.filter((tag) => tag.count > 0)
	})

	/** Toggle tag in/out of chain */
	function toggleTag(tag: string) {
		const key = tag.toLowerCase()
		if (chainLower.includes(key)) {
			chainTags = chainTags.filter((t) => t.toLowerCase() !== key)
		} else {
			chainTags = [...chainTags, tag]
		}
	}

	/** Remove single tag from chain */
	function removeTag(tag: string) {
		const key = tag.toLowerCase()
		chainTags = chainTags.filter((t) => t.toLowerCase() !== key)
	}

	/** Clear entire chain */
	function clearChain() {
		chainTags = []
	}

	/** Play matching tracks */
	async function playChain() {
		if (chainTags.length === 0 || matchingTracks.length === 0) return
		const trackIds = matchingTracks.map((t) => t.id)
		const deckId = appState.active_deck_id
		setPlaylist(deckId, trackIds)
		await playTrack(deckId, trackIds[0], null, 'user_click_track')
	}
</script>

<div class="tag-chain">
	{#if chainTags.length > 0}
		<div class="chain-bar">
			<div class="chain-tags">
				{#each chainTags as tag, i (tag)}
					{#if i > 0}<span class="sep">→</span>{/if}
					<button class="chain-tag" onclick={() => removeTag(tag)}>
						{tag} <span aria-hidden="true">×</span>
					</button>
				{/each}
			</div>
			<div class="chain-actions">
				<button class="play-btn" onclick={playChain} disabled={matchingTracks.length === 0}> ▶ Play </button>
				<a
					href={resolve('/[slug]/tracks', {slug: channelSlug}) + `?tags=${chainTags.map(encodeURIComponent).join(',')}`}
					class="view-link"
				>
					View {matchingTracks.length} tracks
				</a>
				<button class="clear-btn" onclick={clearChain} aria-label="Clear chain">✕</button>
			</div>
		</div>
	{/if}

	<ol class="tag-list">
		{#each visibleTags as { value, count } (value)}
			<li>
				<button
					type="button"
					class="tag-link"
					class:in-chain={chainLower.includes(value.toLowerCase())}
					onclick={() => toggleTag(value)}
				>
					{value}
				</button>
				<span class="count">{count} / {totalCount}</span>
				<span class="bar" style="--pct: {totalCount ? ((count / totalCount) * 100).toFixed(1) : '0.0'}%"></span>
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
		align-items: center;
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
		flex: 0 0 auto;
		color: var(--gray-10);
		font-size: 0.875rem;
		margin-left: auto;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.bar {
		flex: 1;
		height: 2px;
		background: linear-gradient(to left, var(--accent-6) var(--pct), var(--gray-7) var(--pct));
		border-radius: 1px;
		align-self: center;
	}
</style>
