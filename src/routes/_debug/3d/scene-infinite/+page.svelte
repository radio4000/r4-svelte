<script>
	import InfiniteCanvas from '$lib/components/infinite-canvas-ogl.svelte'
	import {appState} from '$lib/app-state.svelte'
	import {shufflePlayChannel} from '$lib/api'
	import {deriveChannelActivityState, toChannelCardMedia} from '$lib/components/channel-ui-state.js'
	import {channelsCollection, tracksCollection} from '$lib/tanstack/collections'
	import {channelAvatarUrl} from '$lib/utils.ts'

	const channels = $derived([...channelsCollection.state.values()].filter((c) => c.image).slice(0, 120))
	const deckCanvasState = $derived.by(() =>
		deriveChannelActivityState({
			decks: appState.decks,
			tracksState: tracksCollection.state,
			channelsState: channelsCollection.state
		})
	)
	const media = $derived(
		channels.map((c) =>
			toChannelCardMedia(c, deckCanvasState, {
				url: channelAvatarUrl(/** @type {string} */ (c.image)),
				width: 250,
				height: 250
			})
		)
	)

	const activeIds = $derived(deckCanvasState.activeChannelIds)
	const activeId = $derived(activeIds[0])
	let selectedId = $state(/** @type {string | null} */ (null))
	let lastClickId = $state(/** @type {string | null} */ (null))
	let lastClickAt = $state(0)
	const DOUBLE_CLICK_MS = 320

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
			<a href="/_debug/3d/scene-rotate">scene-rotate</a>
			<a href="/_debug/3d/card-states">card-states</a>
		</menu>
		<p>Infinite scene with shared 3D channel cards.</p>
	</header>
	<section class="scene">
		<InfiniteCanvas {media} {activeId} {activeIds} {selectedId} onclick={handleClick} />
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
	}
</style>
