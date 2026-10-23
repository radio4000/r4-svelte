<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {appUrl} from '#lib/config.js'
	import {resolve} from '$app/paths'
	import {getChannelCtx, getTracksQueryCtx} from '#lib/contexts.js'
	import {appState, canEditChannel} from '#lib/app-state.svelte.js'
	import {tracksCollection} from '#lib/collections/tracks.js'
	import {eq} from '@tanstack/db'
	import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
	import {getChannelConnections, getFollowedChannels} from '#lib/followed-channels.svelte.js'
	import {computeChannelMatchScore} from '#lib/channel-match-score.js'
	import {findChannelDeck, isListeningToChannel as isListeningToChannelDeck} from '#lib/deck.js'
	import {toggleChannelPlay} from '#lib/api.js'
	import {
		joinBroadcast,
		leaveBroadcast,
		startChannelBroadcast,
		stopBroadcast
	} from '#lib/broadcast.js'
	import {broadcastsCollection} from '#lib/collections/broadcasts.js'
	import {channelPresence} from '#lib/presence.svelte.js'
	import {shortcutHint} from '#lib/keyboard.js'
	import Tracklist from '#lib/components/tracklist.svelte'
	import LinkEntities from '#lib/components/link-entities.svelte'
	import Icon from '#lib/components/icon.svelte'
	import ChannelAvatar from '#lib/components/channel-avatar.svelte'
	import PresenceCount from '#lib/components/presence-count.svelte'
	import SearchInput from '#lib/components/search-input.svelte'
	import ChannelNavControls from '#lib/components/channel-nav-controls.svelte'
	import {tooltip} from '#lib/components/tooltip-attachment.svelte.js'
	import {relativeDate} from '#lib/dates.js'
	import {channelAvatarUrl} from '#lib/utils.js'
	import * as m from '#lib/paraglide/messages.js'
	import Seo from '#lib/components/seo.svelte'

	const HOME_TRACK_PREVIEW_LIMIT = 5

	const channelCtx = getChannelCtx()
	const tracksQuery = getTracksQueryCtx()

	let slug = $derived(page.params.slug as string)
	let {data} = $props()
	let channel = $derived(channelCtx.data ?? data.channel)
	let allTracks = $derived(tracksQuery.data || [])
	let previewTracks = $derived(allTracks.slice(0, HOME_TRACK_PREVIEW_LIMIT))
	let canEdit = $derived(canEditChannel(channel?.id))

	// Play button — same decision tree the header used to drive, now living on the
	// page itself since the header no longer has room/need for a play control.
	let channelDeck = $derived(
		findChannelDeck(appState.decks, appState.active_deck_id, channel?.slug)
	)
	let isChannelPlaying = $derived(Boolean(channelDeck?.is_playing))
	let isAutoEnabled = $derived(Boolean(channelDeck?.auto_radio))
	let activeAutoDrifted = $derived(Boolean(isAutoEnabled && channelDeck?.auto_radio_drifted))
	let playLoading = $state(false)
	let playTooltip = $derived(
		activeAutoDrifted
			? m.auto_radio_resync()
			: (isChannelPlaying ? m.player_tooltip_pause() : m.player_tooltip_play()) +
					shortcutHint('togglePlayPause')
	)
	let playLabel = $derived(isChannelPlaying ? m.player_tooltip_pause() : m.player_tooltip_play())

	async function onPlayAction() {
		if (!channel || playLoading) return
		playLoading = true
		try {
			await toggleChannelPlay(channel)
		} finally {
			playLoading = false
		}
	}

	// Prefills the channel's own tracks page — this page shows only a preview.
	let searchInput = $state('')
	$effect(() => {
		const q = searchInput.trim()
		if (!q) return
		goto(`${resolve('/[slug]/tracks', {slug})}?q=${encodeURIComponent(q)}`, {state: {focus: true}})
	})

	// Live/broadcast — same decision tree the header used to drive.
	const channelBroadcastQuery = useLiveQuery((q) =>
		channel?.id
			? q
					.from({b: broadcastsCollection})
					.where(({b}) => eq(b.channel_id, channel.id))
					.findOne()
			: q
					.from({b: broadcastsCollection})
					.orderBy(({b}) => b.channel_id, 'asc')
					.limit(0)
	)
	let isChannelLive = $derived(Boolean(channelBroadcastQuery.data))
	let isListeningToChannel = $derived(isListeningToChannelDeck(appState.decks, channel?.id))
	let livePresenceCount = $derived(
		channel?.slug ? (channelPresence[channel.slug]?.broadcast ?? 0) : 0
	)
	let liveLoading = $state(false)

	async function onLiveAction() {
		if (!channel || liveLoading) return
		liveLoading = true
		try {
			if (canEdit) {
				if (isChannelLive) {
					await stopBroadcast(channel.id)
				} else {
					await startChannelBroadcast(channel)
				}
				return
			}
			if (isListeningToChannel) {
				leaveBroadcast(appState.active_deck_id)
				return
			}
			if (isChannelLive) {
				await joinBroadcast(appState.active_deck_id, channel.id)
				return
			}
		} finally {
			liveLoading = false
		}
	}

	const follows = getFollowedChannels()
	// Follow-graph ids only — the channel objects shown come from the user's
	// already-loaded followed channels.
	const followerConn = getChannelConnections('followers', () => channel?.id, {hydrate: false})
	const followingConn = getChannelConnections('following', () => channel?.id, {hydrate: false})
	// Own channel's followers — for the "follows you" badge
	const ownFollowers = getChannelConnections('followers', () => appState.channel?.id, {
		hydrate: false
	})

	function compactOverlapText(items: import('#lib/types.js').Channel[]) {
		if (items.length === 0) return ''
		const names = items.slice(0, 2).map((c) => `@${c.slug}`)
		const rest = Math.max(0, items.length - names.length)
		return rest > 0 ? `${names.join(', ')} and ${rest} others` : names.join(', ')
	}

	function formatCoordinate(value: number, positive: string, negative: string) {
		const abs = Math.abs(value)
		const rounded = Number(abs.toFixed(4))
		const compact = String(rounded)
		return `${compact}${value >= 0 ? positive : negative}`
	}

	let followerIdSet = $derived(new Set(followerConn.ids))
	let followingIdSet = $derived(new Set(followingConn.ids))
	let commonFollowers = $derived(follows.followedChannels.filter((c) => followerIdSet.has(c.id)))
	let commonFollowing = $derived(follows.followedChannels.filter((c) => followingIdSet.has(c.id)))
	let previewCommonFollowers = $derived(commonFollowers.slice(0, 4))
	let previewCommonFollowing = $derived(commonFollowing.slice(0, 4))

	// "Follows you" — the viewed channel appears in your own channel followers.
	let followsYou = $derived(Boolean(channel?.id && ownFollowers.ids.includes(channel.id)))

	// Match score — computed from user's own tracks vs this channel's tracks
	let userChannelSlug = $derived(appState.channel?.slug ?? '')
	const userTracksQuery = useLiveQuery(
		(q) =>
			userChannelSlug
				? q
						.from({tracks: tracksCollection})
						.where(({tracks}) => eq(tracks.slug, userChannelSlug))
						.orderBy(({tracks}) => tracks.created_at, 'desc')
				: null,
		[() => userChannelSlug]
	)
	let userChannelTracks = $derived(userTracksQuery.data ?? [])
	let matchScore = $derived(computeChannelMatchScore(userChannelTracks, allTracks))
	let showMatchScore = $derived(
		Boolean(
			appState.user &&
			channel &&
			appState.channel &&
			!canEdit &&
			userChannelTracks.length > 0 &&
			allTracks.length > 0
		)
	)
	let hasMatchInfo = $derived(
		showMatchScore &&
			(matchScore.url.overlap > 0 ||
				matchScore.tag.overlap > 0 ||
				matchScore.artistTitle.overlap > 0)
	)
	let matchingSourceSlug = $derived(appState.channel?.slug ?? '')
	let hasCoordinates = $derived(
		Number.isFinite(Number(channel?.latitude)) &&
			Number.isFinite(Number(channel?.longitude)) &&
			(Number(channel?.latitude) !== 0 || Number(channel?.longitude) !== 0)
	)
	let coordinatesLabel = $derived.by(() => {
		if (!hasCoordinates) return ''
		const lat = Number(channel?.latitude)
		const lng = Number(channel?.longitude)
		return `${formatCoordinate(lat, 'N', 'S')} ${formatCoordinate(lng, 'E', 'W')}`
	})
</script>

<Seo
	title={channel?.name || m.channel_page_fallback()}
	description={channel?.description}
	image={channel?.image ? channelAvatarUrl(channel.image) : undefined}
	url={appUrl + page.url.pathname}
	type="music.radio_station"
/>

{#snippet navControls()}
	<SearchInput
		bind:value={searchInput}
		placeholder={m.channel_tracks_search_placeholder()}
		debounce={300}
	/>
{/snippet}

{#if channel}
	<article>
		<!-- Inside the article: it fills the page height, so a bar above it would overflow -->
		<ChannelNavControls controls={navControls} />
		<div class="channel-meta">
			{#if channel.url}
				<small class="url"
					><a href={channel.url} target="_blank" rel="noopener nofollow ugc">{channel.url}</a
					></small
				>
			{/if}
			{#if channel.description}
				<p class="description"><LinkEntities slug={channel.slug} text={channel.description} /></p>
			{/if}
			<small class="dates">
				{#if hasCoordinates}
					<a href={resolve('/[slug]/map', {slug})} class="coords-link">{coordinatesLabel}</a>
				{/if}
				{m.channel_updated({
					date: relativeDate(channel.latest_track_at ?? channel.updated_at)
				})}
			</small>
		</div>

		<div class="channel-hero">
			<button
				type="button"
				class={[
					'btn',
					'primary',
					'play-hero',
					{active: isChannelPlaying, drifted: activeAutoDrifted}
				]}
				onclick={onPlayAction}
				disabled={playLoading}
				{@attach tooltip({content: playTooltip})}
			>
				<Icon icon={isChannelPlaying ? 'pause' : 'play-fill'} size={22} />
				<span>{playLabel}</span>
			</button>
			{#if isChannelLive || isListeningToChannel}
				<button
					type="button"
					class={['btn', 'live-action', {active: canEdit ? isChannelLive : isListeningToChannel}]}
					onclick={onLiveAction}
					disabled={liveLoading}
					aria-label={canEdit
						? isChannelLive
							? m.broadcast_stop_button()
							: m.broadcast_start_button()
						: isListeningToChannel
							? m.broadcasts_leave()
							: m.broadcasts_join()}
				>
					<Icon icon="signal" size={14} />
					<span>
						{#if canEdit}
							{isChannelLive ? m.broadcast_stop_button() : m.broadcast_start_button()}
						{:else if isListeningToChannel}
							{m.status_live_short()}
						{:else}
							{m.broadcasts_join()}
						{/if}
					</span>
					{#if livePresenceCount > 0}
						<PresenceCount count={livePresenceCount} />
					{/if}
				</button>
			{/if}
		</div>

		{#if appState.user && !canEdit}
			{@const hasAnyOverlap =
				followsYou ||
				previewCommonFollowers.length > 0 ||
				previewCommonFollowing.length > 0 ||
				hasMatchInfo}
			{#if hasAnyOverlap}
				<section class="common-follows compact">
					{#if followsYou || hasMatchInfo}
						<div class="compact-row match-score-row">
							{#if followsYou}
								<span><Icon icon="favorite-fill" size={12} /> {m.channel_follows_you()}</span>
							{/if}
							{#if hasMatchInfo}
								<span><Icon icon="flower-alt" size={12} /> {matchScore.total}% match</span>
								<a
									href={resolve('/[slug]/tracks', {slug}) +
										`?matching=${encodeURIComponent(matchingSourceSlug)}`}
								>
									<Icon icon="play-fill" size={12} />
									{matchScore.url.overlap}
									{m.channel_match_tracks()}
								</a>
								<a
									href={resolve('/[slug]/tags', {slug}) +
										`?matching=${encodeURIComponent(matchingSourceSlug)}`}
								>
									<Icon icon="hashtag" size={12} />
									{matchScore.tag.overlap}
									{m.channel_match_tags()}
								</a>
							{/if}
						</div>
					{/if}
					{#if previewCommonFollowers.length > 0}
						<a href={resolve('/[slug]/followers/in-common', {slug})} class="compact-row">
							<div class="compact-avatars">
								{#each previewCommonFollowers as c (c.id)}
									<ChannelAvatar id={c.image} alt={c.name} size={24} />
								{/each}
							</div>
							<small
								>{m.channel_match_followed_by({names: compactOverlapText(commonFollowers)})}</small
							>
						</a>
					{/if}
					{#if previewCommonFollowing.length > 0}
						<a href={resolve('/[slug]/following/in-common', {slug})} class="compact-row">
							<div class="compact-avatars">
								{#each previewCommonFollowing as c (c.id)}
									<ChannelAvatar id={c.image} alt={c.name} size={24} />
								{/each}
							</div>
							<small
								>{m.channel_match_also_follows({names: compactOverlapText(commonFollowing)})}</small
							>
						</a>
					{/if}
				</section>
			{/if}
		{/if}

		<section class="track-section">
			<!-- No isReady gate: the server-rendered tracks show until the collection syncs -->
			{#if previewTracks.length > 0}
				<Tracklist
					tracks={previewTracks}
					playlistTracks={allTracks}
					{canEdit}
					grouped={false}
					virtual={false}
					playContext={true}
				/>
				<footer>
					<a href={resolve('/[slug]/tracks', {slug})} class="btn chip"
						>{m.channel_see_all_tracks({
							count: tracksQuery.isReady
								? allTracks.length
								: (channel.track_count ?? allTracks.length)
						})}
						<Icon icon="arrow-right" size={12} /></a
					>
				</footer>
			{:else if tracksQuery.isLoading && (channel.track_count ?? 0) > 0}
				<p class="empty">{m.channel_loading_tracks()}</p>
			{:else if tracksQuery.isReady && allTracks.length === 0}
				<p class="empty">{m.channel_no_tracks()}</p>
			{/if}
		</section>
	</article>
{/if}

<style>
	article {
		display: flex;
		flex-direction: column;
		min-height: 100%;
		justify-content: center;
	}

	.channel-hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex-grow: 1;
		gap: var(--space-2);
		padding: var(--space-3) 0.5rem 1rem;
	}

	.play-hero {
		min-height: 3.5rem;
		min-width: 12rem;
		padding-inline: 2rem;
		border-radius: calc(var(--border-radius) * 999);
		font-size: var(--font-6);
		gap: var(--space-2);
	}

	.live-action {
		border-radius: calc(var(--border-radius) * 999);
	}

	.channel-meta {
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.dates {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-1);
	}

	.coords-link {
		color: inherit;
		letter-spacing: 0.01em;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 0.08em;
	}

	.description {
		white-space: pre-line;
		overflow-wrap: break-word;
		font-stretch: 90%;
		font-style: italic;
		color: light-dark(var(--gray-11), var(--gray-9));
		--tag-bg: var(--gray-4);
		--tag-bg-hover: var(--gray-5);
		--tag-bg-active: var(--gray-6);
	}

	.url a {
		color: inherit;
	}

	.track-section {
		display: flex;
		flex-flow: column;
		padding-top: 0.5rem;
		padding-inline: 0.5rem;
		footer {
			margin: 0;
			padding: 0.5rem;
			text-align: center;
		}
	}

	.common-follows {
		padding: 0.25rem 0.5rem;
		display: grid;
	}

	.common-follows.compact {
		font-size: var(--font-2);
		color: var(--gray-9);
	}

	.match-score-row {
		gap: var(--space-2);
		row-gap: var(--space-1);
		flex-wrap: wrap;
		align-items: center;
	}

	.match-score-row span,
	.match-score-row a {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		white-space: nowrap;
		line-height: 1.2;
	}

	.match-score-row a {
		color: inherit;
		text-decoration: underline;
		text-decoration-style: dotted;
	}

	.compact-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 1.25rem;
		color: inherit;
		text-decoration: none;
	}

	.compact-avatars {
		display: inline-flex;
		align-items: center;
		margin-right: var(--space-1);
	}

	.compact-avatars :global(img),
	.compact-avatars :global(svg) {
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		border: 1px solid var(--gray-1);
		margin-right: calc(-1 * var(--space-1));
		background: var(--gray-2);
	}

	.empty {
		padding: 1rem;
	}
</style>
