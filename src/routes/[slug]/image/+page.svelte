<script>
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import {eq} from '@tanstack/db'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {appState} from '$lib/app-state.svelte'
	import {shufflePlayChannel} from '$lib/api'
	import {channelsCollection} from '$lib/collections/channels'
	import {tracksCollection} from '$lib/collections/tracks'
	import {followsCollection} from '$lib/collections/follows'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import {channelAvatarUrl} from '$lib/utils.ts'
	import {deriveChannelActivityState, toChannelCardMedia} from '$lib/components/channel-ui-state.js'
	import ChannelScene from '$lib/components/channel-scene-ogl.svelte'

	let slug = $derived(page.params.slug)
	const channelQuery = useLiveQuery((q) =>
		q
			.from({ch: channelsCollection})
			.where(({ch}) => eq(ch.slug, slug))
			.orderBy(({ch}) => ch.created_at, 'desc')
			.limit(1)
	)
	const followsQuery = useLiveQuery((q) => q.from({follows: followsCollection}))
	const broadcastsQuery = useLiveQuery((q) => q.from({b: broadcastsCollection}))
	let channel = $derived(channelQuery.data?.[0] ?? null)
	let selectedChannelId = $state(/** @type {string | null} */ (null))
	const deckCanvasState = $derived.by(() => {
		const followsRows = followsQuery.data ?? []
		void tracksCollection.state.size
		void channelsCollection.state.size
		const followsState = new Map(
			followsRows
				.map((row) => ({id: typeof row === 'string' ? row : row?.id}))
				.filter((row) => typeof row.id === 'string')
				.map((row) => [row.id, row])
		)
		return deriveChannelActivityState({
			decks: appState.decks,
			tracksState: tracksCollection.state,
			channelsState: channelsCollection.state,
			followsState,
			broadcastRows: broadcastsQuery.data ?? []
		})
	})
	const mediaItem = $derived.by(() => {
		if (!channel) return null
		return toChannelCardMedia(channel, deckCanvasState, {
			url: channel.image
				? channelAvatarUrl(channel.image)
				: `https://placehold.co/250?text=${encodeURIComponent(channel.name?.[0] || '?')}`,
			width: 250,
			height: 250
		})
	})

	function handleSceneClick(item) {
		if (!item?.id) return
		selectedChannelId = item.id
	}

	async function handleSceneDoubleClick(item) {
		if (!item?.id || !item?.slug) return
		await shufflePlayChannel(appState.active_deck_id, {id: item.id, slug: item.slug})
	}

	async function handleNavigate(href, item, kind, token) {
		if (kind === 'channel' && token === 'updated' && item?.slug) {
			const query = new URLSearchParams({display: 'infinite', slug: item.slug})
			await goto(`/?${query.toString()}`)
			return
		}
		if (!href) return
		await goto(href)
	}
</script>

{#if mediaItem}
	<div class="image-page">
		<ChannelScene
			media={[mediaItem]}
			selectedId={selectedChannelId}
			onclick={handleSceneClick}
			ondoubleclick={handleSceneDoubleClick}
			allowNavigation={true}
			enableCardTilt={false}
			singleSceneConstrainMovement={false}
			singleSceneMaxXY={18}
			singleSceneCardDragRotate={true}
			singleSceneMouseDrift={false}
			minCameraZ={26}
			maxCameraZ={70}
			onnavigate={handleNavigate}
		/>
	</div>
{/if}

<style>
	.image-page {
		display: flex;
		flex: 1;
		min-height: 0;
		height: 100%;
	}
</style>
