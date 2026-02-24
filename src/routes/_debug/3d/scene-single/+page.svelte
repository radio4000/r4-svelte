<script>
	import ChannelScene from '$lib/components/channel-scene-ogl.svelte'
	import {useLiveQuery} from '$lib/tanstack/useLiveQuery.svelte'
	import {channelsCollection} from '$lib/tanstack/collections'
	import {channelAvatarUrl, extractHashtags, extractMentions} from '$lib/utils.ts'

	const fallbackDataUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 250"><rect width="250" height="250" rx="26" fill="#101318"/><circle cx="125" cy="110" r="54" fill="#4e6df5"/><rect x="56" y="180" width="138" height="20" rx="10" fill="#e2e8f0"/></svg>')}`
	const channelsQuery = useLiveQuery((q) =>
		q
			.from({ch: channelsCollection})
			.orderBy(({ch}) => ch.created_at, 'desc')
			.limit(120)
	)
	const channels = $derived((channelsQuery.data ?? []).filter((c) => c && c.slug).slice(0, 60))
	let selectedChannelId = $state('')
	let selected = $state(true)
	let active = $state(true)
	let favorite = $state(false)
	let hovered = $state(false)
	let broadcasting = $state(false)
	let rotateEnabled = $state(true)
	let matchingTags = $state(true)

	const channel = $derived.by(() => {
		if (!channels.length) return null
		return channels.find((c) => c.id === selectedChannelId) || channels[0]
	})

	$effect(() => {
		if (!selectedChannelId && channels[0]?.id) selectedChannelId = channels[0].id
	})

	const mediaItem = $derived.by(() => {
		if (!channel) return null
		const tags = extractHashtags(channel.description || '')
		const demoActiveTags = matchingTags ? ['#jazz', '#soul'] : tags.slice(0, 1)
		const activeTags = active ? demoActiveTags : []
		return {
			url: channel.image ? channelAvatarUrl(channel.image) : fallbackDataUrl,
			width: 250,
			height: 250,
			slug: channel.slug,
			id: channel.id,
			name: channel.name,
			description: channel.description || '',
			tags,
			mentions: extractMentions(channel.description || ''),
			activeTags,
			activeMentions: [],
			hasActiveTagMatch: activeTags.length > 0,
			isActive: active,
			isFavorite: favorite,
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
		<form class="row controls">
			<label>
				Channel
				<select bind:value={selectedChannelId}>
					{#each channels as c (c.id)}
						<option value={c.id}>@{c.slug}</option>
					{/each}
				</select>
			</label>
			<fieldset>
				<legend>Focus</legend>
				<label><input type="checkbox" bind:checked={selected} /> selected</label>
				<label><input type="checkbox" bind:checked={hovered} /> hover</label>
			</fieldset>
			<fieldset>
				<legend>Status</legend>
				<label><input type="checkbox" bind:checked={active} /> active</label>
				<label><input type="checkbox" bind:checked={favorite} /> favorite</label>
				<label><input type="checkbox" bind:checked={broadcasting} /> live/broadcasting</label>
			</fieldset>
			<fieldset>
				<legend>Interaction</legend>
				<label><input type="checkbox" bind:checked={rotateEnabled} /> rotate</label>
				<label><input type="checkbox" bind:checked={matchingTags} /> matching-tags-demo</label>
			</fieldset>
		</form>
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
	.controls {
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
	}
	fieldset {
		display: inline-flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
</style>
