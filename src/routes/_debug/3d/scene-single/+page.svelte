<script>
	import ChannelScene from '$lib/components/channel-scene-ogl.svelte'
	import {channelsCollection} from '$lib/tanstack/collections'
	import {channelAvatarUrl, extractHashtags, extractMentions} from '$lib/utils.ts'

	const channels = $derived([...channelsCollection.state.values()].filter((c) => c.image).slice(0, 30))
	let selectedChannelId = $state('')
	let selected = $state(true)
	let active = $state(true)
	let hovered = $state(false)
	let broadcasting = $state(false)
	let rotateEnabled = $state(true)

	const channel = $derived.by(() => {
		if (!channels.length) return null
		return channels.find((c) => c.id === selectedChannelId) || channels[0]
	})

	$effect(() => {
		if (!selectedChannelId && channels[0]?.id) selectedChannelId = channels[0].id
	})

	const mediaItem = $derived.by(() => {
		if (!channel?.image) return null
		const tags = extractHashtags(channel.description || '')
		return {
			url: channelAvatarUrl(channel.image),
			width: 250,
			height: 250,
			slug: channel.slug,
			id: channel.id,
			name: channel.name,
			description: channel.description || '',
			tags,
			mentions: extractMentions(channel.description || ''),
			activeTags: tags.slice(0, 1),
			activeMentions: [],
			hasActiveTagMatch: tags.length > 0,
			isActive: active,
			isLive: broadcasting,
			channel
		}
	})
</script>

<svelte:head>
	<title>Debug 3D Single</title>
</svelte:head>

<article class="fill-height">
	<header>
		<menu class="nav-grouped">
			<a href="/_debug/3d">&larr;</a>
			<a href="/_debug/3d/scene-infinite">scene-infinite</a>
			<a href="/_debug/3d/scene-single">scene-single</a>
			<a href="/_debug/3d/card-states">card-states</a>
		</menu>
		<div class="row">
			<label>
				Channel
				<select bind:value={selectedChannelId}>
					{#each channels as c (c.id)}
						<option value={c.id}>@{c.slug}</option>
					{/each}
				</select>
			</label>
			<label><input type="checkbox" bind:checked={selected} /> selected</label>
			<label><input type="checkbox" bind:checked={active} /> active</label>
			<label><input type="checkbox" bind:checked={hovered} /> hover</label>
			<label><input type="checkbox" bind:checked={broadcasting} /> broadcasting</label>
			<label><input type="checkbox" bind:checked={rotateEnabled} /> rotate</label>
		</div>
	</header>

	{#if mediaItem && channel}
		<section class="scene">
			<ChannelScene
				media={[mediaItem]}
				activeId={active ? channel.id : undefined}
				activeIds={active ? [channel.id] : []}
				selectedId={selected ? channel.id : null}
				hoveredId={hovered ? channel.id : null}
				allowNavigation={true}
				enableCardTilt={false}
				singleSceneConstrainMovement={false}
				singleSceneMaxXY={18}
				singleSceneCardDragRotate={rotateEnabled}
				singleSceneMouseDrift={false}
				minCameraZ={26}
				maxCameraZ={70}
			/>
		</section>
	{/if}
</article>

<style>
	article {
		display: flex;
		flex-direction: column;
	}
	.scene {
		flex: 1;
		min-height: 0;
	}
	select {
		min-width: 12rem;
	}
</style>
