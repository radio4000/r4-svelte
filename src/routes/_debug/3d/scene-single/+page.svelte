<script>
	import ChannelScene from '$lib/components/channel-scene-ogl.svelte'
	import {onMount} from 'svelte'
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
	let matchingTagCount = $state(0)
	let rotateEnabled = $state(true)
	let gui = null
	let guiChannelsKey = $state('')
	let guiControllers = $state([])
	let sceneEl = $state()

	function handleNavigate(href) {
		if (!href) return
		window.location.assign(href)
	}

	async function rebuildGui() {
		if (typeof window === 'undefined' || !channels.length || !sceneEl) return
		const channelsKey = channels.map((c) => c.id).join('|')
		if (gui && channelsKey === guiChannelsKey) return
		if (gui) {
			gui.destroy()
			gui = null
			guiControllers = []
		}
		const {GUI} = await import('lil-gui')
		const channelOptions = Object.fromEntries(channels.map((c) => [`@${c.slug}`, c.id]))
		const params = {
			channel: selectedChannelId || channels[0]?.id || '',
			selected,
			active,
			favorite,
			live: broadcasting,
			hover: hovered,
			matchingTags: matchingTagCount,
			rotate: rotateEnabled
		}
		const nextGui = new GUI({title: '3D Single Debug', autoPlace: false, container: sceneEl})
		nextGui.domElement.style.position = 'absolute'
		nextGui.domElement.style.top = '0.5rem'
		nextGui.domElement.style.right = '0.5rem'
		nextGui.domElement.style.left = 'auto'
		nextGui.domElement.style.bottom = 'auto'
		nextGui.domElement.style.zIndex = '4'
		const controllers = []
		controllers.push(
			nextGui
				.add(params, 'channel', channelOptions)
				.name('channel')
				.onChange((value) => (selectedChannelId = String(value || '')))
		)
		controllers.push(nextGui.add(params, 'selected').onChange((value) => (selected = !!value)))
		controllers.push(nextGui.add(params, 'active').onChange((value) => (active = !!value)))
		controllers.push(nextGui.add(params, 'favorite').onChange((value) => (favorite = !!value)))
		controllers.push(
			nextGui
				.add(params, 'live')
				.name('broadcasting')
				.onChange((value) => (broadcasting = !!value))
		)
		controllers.push(nextGui.add(params, 'hover').onChange((value) => (hovered = !!value)))
		controllers.push(
			nextGui
				.add(params, 'matchingTags', 0, 10, 1)
				.name('matching tags')
				.onChange((value) => (matchingTagCount = Number(value) || 0))
		)
		controllers.push(nextGui.add(params, 'rotate').onChange((value) => (rotateEnabled = !!value)))
		gui = nextGui
		guiControllers = controllers
		guiChannelsKey = channelsKey
	}

	const channel = $derived.by(() => {
		if (!channels.length) return null
		return channels.find((c) => c.id === selectedChannelId) || channels[0]
	})

	$effect(() => {
		if (!selectedChannelId && channels[0]?.id) selectedChannelId = channels[0].id
	})

	$effect(() => {
		void channels.length
		void rebuildGui()
	})

	$effect(() => {
		if (!guiControllers.length) return
		for (const controller of guiControllers) controller.updateDisplay()
	})

	onMount(() => {
		return () => {
			if (gui) gui.destroy()
			gui = null
			guiControllers = []
		}
	})

	const mediaItem = $derived.by(() => {
		if (!channel) return null
		const tags = extractHashtags(channel.description || '')
		const count = Math.max(0, Math.min(10, Number(matchingTagCount) || 0))
		const tagPool = [...new Set([...tags, ...Array.from({length: 10}, (_, i) => `#match${i + 1}`)])]
		const activeTags = tagPool.slice(0, count)
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
		</menu>
	</header>

	{#if mediaItem && channel}
		<section class="scene" bind:this={sceneEl}>
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
				onnavigate={handleNavigate}
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
		position: relative;
	}
</style>
