<script lang="ts">
	import {eq} from '@tanstack/db'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {tracksCollection} from '$lib/collections/tracks'
	import {buildTagGraph} from '$lib/utils'
	import TagGalaxy from '$lib/components/tag-galaxy.svelte'
	import type {TagGraphNode} from '$lib/utils'

	let slug = $state('')
	let minEdgeWeight = $state(2)
	let maxEdgesPerNode = $state(20)
	let maxTags = $state(300)
	let search = $state('')
	let clickedNode = $state<TagGraphNode | null>(null)

	const tracksQuery = useLiveQuery((q) =>
		slug
			? q
					.from({tracks: tracksCollection})
					.where(({tracks}) => eq(tracks.slug, slug))
					.orderBy(({tracks}) => tracks.created_at, 'desc')
			: q.from({tracks: tracksCollection}).limit(0)
	)

	let tracks = $derived(tracksQuery.data ?? [])

	let graph = $derived(buildTagGraph(tracks, {minEdgeWeight, maxEdgesPerNode, maxTags}))
</script>

<svelte:head>
	<title>Debug: Tag Galaxy</title>
</svelte:head>

<div class="page">
	<header class="toolbar">
		<a href="/_debug">&larr;</a>

		<input class="slug-input" type="text" placeholder="channel slug…" bind:value={slug} />

		<label>
			<span>min co-occur: {minEdgeWeight}</span>
			<input type="range" min="1" max="20" step="1" bind:value={minEdgeWeight} />
		</label>

		<label>
			<span>max edges/node: {maxEdgesPerNode}</span>
			<input type="range" min="1" max="50" step="1" bind:value={maxEdgesPerNode} />
		</label>

		<label>
			<span>max tags: {maxTags}</span>
			<input type="range" min="20" max="500" step="10" bind:value={maxTags} />
		</label>

		<input class="search-box" type="search" placeholder="highlight tag…" bind:value={search} />

		<small class="stats">
			{tracks.length} tracks · {graph.nodes.length} nodes · {graph.edges.length} edges
			{#if clickedNode}&nbsp;· clicked: {clickedNode.label} ({clickedNode.count}){/if}
		</small>
	</header>

	{#if !slug}
		<p class="status">Enter a channel slug above to load its tracks.</p>
	{:else if tracksQuery.isLoading}
		<p class="status">Loading…</p>
	{:else if tracks.length === 0}
		<p class="status">No tracks found for <strong>{slug}</strong>.</p>
	{:else if graph.nodes.length === 0}
		<p class="status">No tags with co-occurrence ≥ {minEdgeWeight}. Try lowering the slider.</p>
	{:else}
		<div class="canvas-wrap">
			<TagGalaxy
				nodes={graph.nodes}
				edges={graph.edges}
				searchQuery={search}
				onNodeClick={(n) => {
					clickedNode = n
				}}
			/>
		</div>
	{/if}
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.toolbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.6rem;
		padding: 0.4rem 0.6rem;
		border-bottom: 1px solid var(--gray-6);
		font-size: 0.8rem;
	}

	.toolbar label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		white-space: nowrap;
	}

	.toolbar input[type='range'] {
		width: 80px;
	}

	.slug-input {
		width: 120px;
	}

	.search-box {
		width: 120px;
	}

	.stats {
		color: var(--gray-11);
		margin-left: auto;
	}

	.status {
		padding: 2rem;
		color: var(--gray-11);
	}

	.canvas-wrap {
		flex: 1;
		min-height: 0;
		position: relative;
	}
</style>
