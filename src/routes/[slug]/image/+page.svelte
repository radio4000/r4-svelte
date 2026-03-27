<script module>
	const RE_LEADING_HASH = /^#/
	const RE_LEADING_AT = /^@/
</script>

<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import {loadDeckView, playTrack, shufflePlayChannel} from '$lib/api'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import {getChannelActivity} from '$lib/channel-activity.svelte'
	const channelActivity = $derived(getChannelActivity())
	import {channelAvatarUrl} from '$lib/utils'
	import {toChannelCardMedia} from '$lib/components/channel-ui-state.js'
	import {getChannelCtx, getTracksQueryCtx} from '$lib/contexts'
	import ChannelScene from '$lib/components/channel-scene-ogl.svelte'
	import ChannelNavControlsPortal from '$lib/components/channel-nav-controls-portal.svelte'
	import Icon from '$lib/components/icon.svelte'

	const channelCtx = getChannelCtx()
	const tracksQuery = getTracksQueryCtx()
	let channel = $derived(channelCtx.data ?? null)
	let channelTracks = $derived(tracksQuery.data ?? [])
	let selectedChannelId = $state(/** @type {string | null} */ (null))
	let showControlsModal = $state(false)
	const imageBase = $derived(
		channel?.image ? {url: channelAvatarUrl(channel.image, 1024, 'webp', 90)} : undefined
	)
	const isChannelLive = $derived.by(() => {
		const channelId = channel?.id
		if (!channelId) return false
		void broadcastsCollection.state.size
		const remoteLive = broadcastsCollection.state.has(channelId)
		const localLive = Object.values(appState.decks).some(
			(deck) => deck.broadcasting_channel_id === channelId
		)
		return remoteLive || localLive
	})
	const mediaItem = $derived.by(() => {
		if (!channel) return null
		return {
			...toChannelCardMedia(channel, channelActivity, imageBase),
			isLive: isChannelLive
		}
	})

	function handleSceneClick(item) {
		if (!item?.id) return
		selectedChannelId = item.id
	}

	/** Strip leading `#` to get a bare tag for comparison against track.tags */
	const stripHash = (v) => String(v || '').replace(RE_LEADING_HASH, '')
	/** Strip leading `@` to get a bare mention for comparison against track.mentions */
	const stripAt = (v) => String(v || '').replace(RE_LEADING_AT, '')

	function playByTagToken(token) {
		const tag = stripHash(token)
		if (!tag) return false
		const slug = channel?.slug
		const matches = channelTracks.filter((track) =>
			(track?.tags || []).some((entry) => stripHash(entry) === tag)
		)
		if (!matches.length) return false
		const ids = matches.map((t) => t.id).filter(Boolean)
		if (!ids.length) return false
		loadDeckView(
			appState.active_deck_id,
			{sources: [{channels: slug ? [slug] : undefined, tags: [tag]}]},
			ids,
			{slug: slug || undefined}
		)
		playTrack(appState.active_deck_id, ids[0], null, 'play_search')
		return true
	}

	function playByMentionToken(token) {
		const mention = stripAt(token)
		if (!mention) return false
		const slug = channel?.slug
		const matches = channelTracks.filter((track) =>
			(track?.mentions || []).some((entry) => stripAt(entry) === mention)
		)
		if (!matches.length) return false
		const ids = matches.map((t) => t.id).filter(Boolean)
		if (!ids.length) return false
		loadDeckView(
			appState.active_deck_id,
			{sources: [{channels: slug ? [slug] : undefined, search: mention}]},
			ids,
			{slug: slug || undefined}
		)
		playTrack(appState.active_deck_id, ids[0], null, 'play_search')
		return true
	}

	async function handleSceneDoubleClick(item) {
		if (!item?.id || !item?.slug) return
		await shufflePlayChannel(appState.active_deck_id, {id: item.id, slug: item.slug})
	}

	async function handleNavigate(href, item, kind, token) {
		if (kind === 'tag' && token && playByTagToken(token)) return
		if (kind === 'mention' && token && playByMentionToken(token)) return
		if (kind === 'channel' && token === 'updated' && item?.slug) {
			const query = new URLSearchParams({display: 'infinite', slug: item.slug})
			await goto(`/?${query.toString()}`)
			return
		}
		if (!href) return
		await goto(href)
	}
</script>

<ChannelNavControlsPortal controls={navControls} />

{#snippet navControls()}
	{#if channel?.slug}
		<a class="btn" href={resolve('/[slug]', {slug: channel.slug})}>
			<Icon icon="arrow-left" />
		</a>
	{/if}
	<button type="button" class="btn" title="3D controls" onclick={() => (showControlsModal = true)}>
		<Icon icon="circle-info" />
	</button>
{/snippet}

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
			showInfoButton={false}
			bind:showControlsModal
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
