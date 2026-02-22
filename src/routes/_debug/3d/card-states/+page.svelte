<script>
	import ChannelScene from '$lib/components/channel-scene-ogl.svelte'
	import {channelsCollection} from '$lib/tanstack/collections'
	import {channelAvatarUrl, extractHashtags, extractMentions} from '$lib/utils.ts'

	const channel = $derived([...channelsCollection.state.values()].find((c) => c.image))
	const tags = $derived(extractHashtags(channel?.description || ''))
	const mentions = $derived(extractMentions(channel?.description || ''))
	const sampleTag = $derived(tags[0] || '#sample')
	const sampleMention = $derived(mentions[0] || '@radio4000')

	const baseItem = $derived.by(() => {
		if (!channel?.image) return null
		return {
			url: channelAvatarUrl(channel.image),
			width: 250,
			height: 250,
			slug: channel.slug,
			id: channel.id,
			name: channel.name,
			description: channel.description || '',
			tags,
			mentions,
			channel
		}
	})

	const states = $derived.by(() => {
		if (!baseItem || !channel) return []
		return [
			{
				id: 'default',
				label: 'default',
				media: [{...baseItem, activeTags: [], activeMentions: [], hasActiveTagMatch: false}]
			},
			{
				id: 'hover',
				label: 'hover',
				hoveredId: channel.id,
				media: [{...baseItem, activeTags: [], activeMentions: [], hasActiveTagMatch: false}]
			},
			{
				id: 'selected',
				label: 'selected',
				selectedId: channel.id,
				media: [{...baseItem, activeTags: [], activeMentions: [], hasActiveTagMatch: false}]
			},
			{
				id: 'active',
				label: 'active',
				activeIds: [channel.id],
				activeId: channel.id,
				selectedId: channel.id,
				media: [{...baseItem, isActive: true, activeTags: [], activeMentions: [], hasActiveTagMatch: false}]
			},
			{
				id: 'active-tag',
				label: 'active + tag',
				activeIds: [channel.id],
				activeId: channel.id,
				selectedId: channel.id,
				media: [
					{
						...baseItem,
						isActive: true,
						activeTags: [sampleTag],
						activeMentions: [],
						hasActiveTagMatch: true
					}
				]
			},
			{
				id: 'active-mention',
				label: 'active mention',
				activeIds: [channel.id],
				activeId: channel.id,
				selectedId: channel.id,
				media: [
					{
						...baseItem,
						isActive: true,
						activeTags: [],
						activeMentions: [sampleMention],
						hasActiveTagMatch: false
					}
				]
			},
			{
				id: 'playing',
				label: 'playing',
				activeIds: [channel.id],
				activeId: channel.id,
				selectedId: channel.id,
				media: [{...baseItem, isPlaying: true, isActive: true, activeTags: [], activeMentions: []}]
			},
			{
				id: 'live-favorite',
				label: 'live + favorite',
				activeIds: [channel.id],
				activeId: channel.id,
				media: [{...baseItem, isLive: true, isFavorite: true, activeTags: [], activeMentions: []}]
			}
		]
	})
</script>

<svelte:head>
	<title>Debug 3D Card States</title>
</svelte:head>

<article class="container">
	<header>
		<menu class="nav-grouped">
			<a href="/_debug/3d">&larr;</a>
			<a href="/_debug/3d/scene-infinite">scene-infinite</a>
			<a href="/_debug/3d/scene-single">scene-single</a>
			<a href="/_debug/3d/card-states">card-states</a>
		</menu>
		<p>Visual matrix for 3D card states including active tag and mention states.</p>
	</header>

	{#if states.length}
		<section class="grid">
			{#each states as state (state.id)}
				<figure>
					<figcaption>{state.label}</figcaption>
					<div class="scene">
						<ChannelScene
							media={state.media}
							activeId={state.activeId}
							activeIds={state.activeIds || []}
							selectedId={state.selectedId ?? null}
							hoveredId={state.hoveredId ?? null}
						/>
					</div>
				</figure>
			{/each}
		</section>
	{/if}
</article>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 0.75rem;
	}
	figure {
		margin: 0;
		padding: 0.5rem;
		border: 1px solid var(--gray-4);
		border-radius: var(--border-radius);
	}
	figcaption {
		font-size: var(--font-2);
		margin-bottom: 0.25rem;
	}
	.scene {
		height: 340px;
	}
</style>
