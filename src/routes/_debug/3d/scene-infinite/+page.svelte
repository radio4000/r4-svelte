<script>
	import InfiniteCanvas from '$lib/components/infinite-canvas-ogl.svelte'
	import {onMount} from 'svelte'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {appState} from '$lib/app-state.svelte'
	import {shufflePlayChannel} from '$lib/api'
	import {getChannelActivity} from '$lib/channel-activity.svelte'
	const channelActivity = $derived(getChannelActivity())
	import {toChannelCardMedia} from '$lib/components/channel-ui-state.js'
	import {channelsCollection} from '$lib/collections/channels'
	import {channelAvatarUrl} from '$lib/utils.ts'

	const channelsQuery = useLiveQuery((q) =>
		q
			.from({ch: channelsCollection})
			.orderBy(({ch}) => ch.created_at, 'desc')
			.limit(120)
	)
	const channels = $derived((channelsQuery.data ?? []).filter((c) => c?.image))
	const media = $derived(
		channels.map((c) =>
			toChannelCardMedia(c, channelActivity, {
				url: channelAvatarUrl(/** @type {string} */ (c.image)),
				width: 250,
				height: 250
			})
		)
	)

	const activeIds = $derived(channelActivity.activeChannelIds)
	const activeId = $derived(activeIds[0])
	let selectedId = $state(/** @type {string | null} */ (null))
	let lastClickId = $state(/** @type {string | null} */ (null))
	let lastClickAt = $state(0)
	const DOUBLE_CLICK_MS = 320
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
		const channelOptions = Object.fromEntries([['(none)', ''], ...channels.map((c) => [`@${c.slug}`, c.id])])
		const params = {
			selected: selectedId || '',
			clearSelection() {
				selectedId = null
			}
		}
		const nextGui = new GUI({title: '3D Infinite Debug', autoPlace: false, container: sceneEl})
		nextGui.domElement.style.position = 'absolute'
		nextGui.domElement.style.top = '0.5rem'
		nextGui.domElement.style.right = '0.5rem'
		nextGui.domElement.style.left = 'auto'
		nextGui.domElement.style.bottom = 'auto'
		nextGui.domElement.style.zIndex = '4'
		const controllers = []
		controllers.push(
			nextGui
				.add(params, 'selected', channelOptions)
				.name('selected channel')
				.onChange((value) => (selectedId = value ? String(value) : null))
		)
		controllers.push(nextGui.add(params, 'clearSelection').name('clear selection'))
		gui = nextGui
		guiControllers = controllers
		guiChannelsKey = channelsKey
	}

	async function handleClick(item) {
		if (!item?.slug || !item?.id) return
		const now = performance.now()
		const isDoubleClick = lastClickId === item.id && now - lastClickAt <= DOUBLE_CLICK_MS
		selectedId = item.id
		if (isDoubleClick) {
			lastClickId = null
			lastClickAt = 0
			await shufflePlayChannel(appState.active_deck_id, {id: item.id, slug: item.slug})
			return
		}
		lastClickId = item.id
		lastClickAt = now
	}

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
</script>

<svelte:head>
	<title>Debug 3D Infinite</title>
</svelte:head>

<article class="fill-height">
	<header>
		<menu class="nav-grouped">
			<a href="/_debug/3d">&larr;</a>
			<a href="/_debug/3d/scene-infinite">scene-infinite</a>
			<a href="/_debug/3d/scene-single">scene-single</a>
		</menu>
		<p>Infinite scene with shared 3D channel cards.</p>
	</header>
	<section class="scene" bind:this={sceneEl}>
		<InfiniteCanvas {media} {activeId} {activeIds} {selectedId} onclick={handleClick} onnavigate={handleNavigate} />
	</section>
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
