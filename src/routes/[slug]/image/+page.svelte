<script module>
	const RE_LEADING_HASH = /^#/
	const RE_LEADING_AT = /^@/
</script>

<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {appState} from '#lib/app-state.svelte.js'
	import {loadDeckView, playTrack, shufflePlayChannel} from '#lib/api.js'
	import {broadcastsCollection} from '#lib/collections/broadcasts.js'
	import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
	import {eq} from '@tanstack/db'
	import {getChannelActivity} from '#lib/channel-activity.svelte.js'
	import {channelAvatarUrl} from '#lib/utils.js'
	import {isBroadcasting} from '#lib/deck.js'
	import {toChannelCardMedia} from '#lib/components/channel-ui-state.ts'
	import {getChannelCtx, getTracksQueryCtx} from '#lib/contexts.js'
	import ChannelScene from '#lib/components/channel-scene-ogl.svelte'
	import ChannelNavControls from '#lib/components/channel-nav-controls.svelte'
	import Icon from '#lib/components/icon.svelte'
	import * as m from '#lib/paraglide/messages.js'

	const channelActivity = $derived(getChannelActivity())
	const channelCtx = getChannelCtx()
	const tracksQuery = getTracksQueryCtx()
	let channel = $derived(channelCtx.data ?? null)
	let channelTracks = $derived(tracksQuery.data ?? [])
	let selectedChannelId = $state(/** @type {string | null} */ (null))
	let showControlsModal = $state(false)
	const imageBase = $derived(
		channel?.image ? {url: channelAvatarUrl(channel.image, 1024, 'webp', 90)} : undefined
	)
	const broadcastQuery = useLiveQuery((q) => {
		const channelId = channel?.id
		return channelId
			? q.from({b: broadcastsCollection}).where(({b}) => eq(b.channel_id, channelId))
			: null
	})
	const isChannelLive = $derived.by(() => {
		const channelId = channel?.id
		if (!channelId) return false
		const remoteLive = (broadcastQuery.data ?? []).length > 0
		const localLive = isBroadcasting(appState.decks, channelId)
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
			await goto(`${resolve('/')}?${query.toString()}`)
			return
		}
		if (!href) return
		await goto(href)
	}
</script>

{#snippet navControls()}
	{#if channel?.slug}
		<a class="btn" href={resolve('/[slug]', {slug: channel.slug})}>
			<Icon icon="arrow-left" />
		</a>
	{/if}
	<button
		type="button"
		class="btn"
		title={m.canvas_controls_button_title()}
		onclick={() => (showControlsModal = true)}
	>
		<Icon icon="circle-info" />
	</button>
{/snippet}

{#if mediaItem}
	<div class="image-page">
		<ChannelNavControls controls={navControls} />
		<div class="scene">
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
	</div>
{/if}

<style>
	.image-page {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		height: 100%;
	}

	.scene {
		flex: 1;
		min-height: 0;
	}
</style>
