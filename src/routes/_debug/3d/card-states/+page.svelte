<script>
	import ChannelScene from '$lib/components/channel-scene-ogl.svelte'
	import {channelsCollection} from '$lib/tanstack/collections'
	import {channelAvatarUrl, extractHashtags, extractMentions} from '$lib/utils.ts'

	const fallbackDataUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 250"><rect width="250" height="250" rx="26" fill="#101318"/><circle cx="125" cy="110" r="54" fill="#4e6df5"/><rect x="56" y="180" width="138" height="20" rx="10" fill="#e2e8f0"/></svg>')}`
	const channel = $derived.by(() => {
		const values = [...channelsCollection.state.values()]
		return values.find((c) => c.image) || values[0] || null
	})
	const tags = $derived(extractHashtags(channel?.description || ''))
	const mentions = $derived(extractMentions(channel?.description || ''))
	const sampleTag = $derived(tags[0] || '#sample')
	const sampleMention = $derived(mentions[0] || '@radio4000')

	const baseItem = $derived.by(() => {
		return {
			url: channel?.image ? channelAvatarUrl(channel.image) : fallbackDataUrl,
			width: 250,
			height: 250,
			slug: channel?.slug || 'debug-3d',
			id: channel?.id || 'debug-3d',
			name: channel?.name || 'Debug 3D',
			description: channel?.description || '',
			tags,
			mentions,
			channel: channel || {track_count: 42, updated_at: new Date().toISOString()}
		}
	})

	const states = $derived.by(() => {
		if (!baseItem) return []
		const channelId = baseItem.id
		return [
			{
				id: 'default',
				label: 'default',
				media: [{...baseItem, activeTags: [], activeMentions: [], hasActiveTagMatch: false}]
			},
			{
				id: 'hover',
				label: 'hover',
				hoveredId: channelId,
				media: [{...baseItem, activeTags: [], activeMentions: [], hasActiveTagMatch: false}]
			},
			{
				id: 'selected',
				label: 'selected',
				selectedId: channelId,
				media: [{...baseItem, activeTags: [], activeMentions: [], hasActiveTagMatch: false}]
			},
			{
				id: 'active',
				label: 'active',
				activeIds: [channelId],
				activeId: channelId,
				selectedId: channelId,
				media: [{...baseItem, isActive: true, activeTags: [], activeMentions: [], hasActiveTagMatch: false}]
			},
			{
				id: 'active-tag',
				label: 'active + tag',
				activeIds: [channelId],
				activeId: channelId,
				selectedId: channelId,
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
				activeIds: [channelId],
				activeId: channelId,
				selectedId: channelId,
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
				activeIds: [channelId],
				activeId: channelId,
				selectedId: channelId,
				media: [{...baseItem, isPlaying: true, isActive: true, activeTags: [], activeMentions: []}]
			},
			{
				id: 'live-favorite',
				label: 'live + favorite',
				activeIds: [channelId],
				activeId: channelId,
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
