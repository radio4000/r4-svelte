<script>
	import {goto} from '$app/navigation'
	import {appState} from '$lib/app-state.svelte'
	import {playTrack, setPlaylist, shufflePlayChannel} from '$lib/api'
	import {channelAvatarUrl} from '$lib/utils.ts'
	import {channelActivity} from '$lib/channel-activity.svelte'
	import {toChannelCardMedia} from '$lib/components/channel-ui-state.js'
	import {getChannelCtx, getTracksQueryCtx} from '$lib/contexts'
	import ChannelScene from '$lib/components/channel-scene-ogl.svelte'

	const channelCtx = getChannelCtx()
	const tracksQuery = getTracksQueryCtx()
	let channel = $derived(channelCtx.data ?? null)
	let channelTracks = $derived(tracksQuery.data ?? [])
	let selectedChannelId = $state(/** @type {string | null} */ (null))
	const mediaItem = $derived.by(() => {
		if (!channel) return null
		return toChannelCardMedia(channel, channelActivity, {
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

	function playTracks(tracks, title) {
		if (!tracks.length) return false
		const ids = tracks.map((track) => track.id).filter(Boolean)
		if (!ids.length) return false
		setPlaylist(appState.active_deck_id, ids, {title})
		playTrack(appState.active_deck_id, ids[0], null, 'play_search')
		return true
	}

	/** Strip leading `#` to get a bare tag for comparison against track.tags */
	const stripHash = (v) => String(v || '').replace(/^#/, '')
	/** Strip leading `@` to get a bare mention for comparison against track.mentions */
	const stripAt = (v) => String(v || '').replace(/^@/, '')

	function playByTagToken(token) {
		const tag = stripHash(token)
		if (!tag) return false
		const matches = channelTracks.filter((track) => (track?.tags || []).some((entry) => stripHash(entry) === tag))
		return playTracks(matches, `#${tag}`)
	}

	function playByMentionToken(token) {
		const mention = stripAt(token)
		if (!mention) return false
		const matches = channelTracks.filter((track) =>
			(track?.mentions || []).some((entry) => stripAt(entry) === mention)
		)
		return playTracks(matches, `@${mention}`)
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
