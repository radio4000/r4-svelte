<script>
	import {untrack} from 'svelte'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {
		togglePlayPause,
		next,
		previous,
		getMediaPlayer,
		resyncAutoRadio,
		leaveAutoRadio,
		rejoinAutoRadio,
		toggleDeckCompact,
		expandDeck,
		toggleShuffle
	} from '$lib/api'
	import {isDbId, isMobileViewport} from '$lib/utils'
	import {isGroupControlDeck, sortedListeningDeckIds} from '$lib/deck'
	import {createDeckDisplay} from '$lib/player/deck-display.svelte'
	import {getActiveQueue, canPlay, canPrev, canNext} from '$lib/player/queue'
	import {parseUrl} from 'media-now/parse-url'
	import * as m from '$lib/paraglide/messages'
	import Icon from '$lib/components/icon.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import DeckMenu from '$lib/components/deck-menu.svelte'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import ChannelMicroCard from '$lib/components/channel-micro-card.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import SpeedControl from '$lib/components/speed-control.svelte'
	import VolumeControl from '$lib/components/volume-control.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import PlayerProgress from '$lib/components/player-progress.svelte'
	import {shortcutHint} from '$lib/keyboard'

	/** @type {{deckId: number, showEdgeControls?: boolean}} */
	let {deckId, showEdgeControls = true} = $props()

	let deck = $derived(appState.decks[deckId])
	let listeningDeckIds = $derived(sortedListeningDeckIds(appState.decks))
	let isListeningGroupControlDeck = $derived(isGroupControlDeck(deck, deckId, listeningDeckIds))

	// deckId never changes for this component instance — it's rendered inside
	// an {#each ... (deckId)} keyed block, so a changed deckId remounts it.
	const display = createDeckDisplay(untrack(() => deckId))
	const track = $derived(display.track)
	const displayTrack = $derived(display.displayTrack)
	const displayChannel = $derived(display.displayChannel)
	const headerChannel = $derived(display.headerChannel)
	const secondaryChannel = $derived(display.secondaryHeaderChannel)
	const modePresenceCount = $derived(display.presenceCount)
	let canEditTrackChannel = $derived(
		Boolean(displayChannel?.id && canEditChannel(displayChannel.id))
	)
	let trackHref = $derived(
		!appState.embed_mode && displayTrack?.slug && displayTrack?.id && isDbId(displayTrack.id)
			? resolve('/[slug]/tracks/[tid]', {slug: displayTrack.slug, tid: String(displayTrack.id)})
			: undefined
	)
	let provider = $derived(
		displayTrack?.provider ||
			(displayTrack?.url ? parseUrl(displayTrack.url)?.provider : null) ||
			null
	)

	let activeQueue = $derived(getActiveQueue(deck))
	let canPlayFromQueue = $derived(canPlay(activeQueue, track?.id))
	let canPrevFromQueue = $derived(canPrev(activeQueue, track?.id))
	let canNextFromQueue = $derived(canNext(activeQueue, track?.id))

	let deckMenu = $state(/** @type {{close: () => void} | undefined} */ (undefined))
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
	class="deck-compact-bar"
	onclick={(e) => {
		const target = e.target instanceof Element ? e.target : undefined
		const interactiveTarget = target?.closest(
			'button, input, select, textarea, [popover], [role="slider"]'
		)
		if (isMobileViewport()) {
			if (interactiveTarget) return
			if (target?.closest('a')) e.preventDefault()
			appState.active_deck_id = deckId
			expandDeck(deckId)
			return
		}
		if (interactiveTarget || target?.closest('a')) return
		appState.active_deck_id = deckId
	}}
>
	<div class="deck-inner" class:active-track-bg={Boolean(displayTrack)}>
		{#if appState.show_track_range_control !== false && displayTrack}
			<PlayerProgress
				currentTime={deck?.media_current_time ?? 0}
				mediaDuration={deck?.media_duration ?? NaN}
				trackDuration={displayTrack?.duration}
				isPlaying={Boolean(deck?.is_playing)}
				disabled={Boolean(deck?.listening_to_channel_id)}
				onseek={(val) => {
					if (deck) deck.media_current_time = val
					const mediaElement = getMediaPlayer(deckId)
					if (mediaElement) mediaElement.currentTime = val
				}}
			/>
		{/if}
		<div class="deck-row">
			<div class="deck-identity">
				{#if displayTrack}
					<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
					<div
						class="track-panel"
						onclick={(e) => {
							if (isMobileViewport()) return
							if (!trackHref) return
							if (e.target instanceof Element && e.target.closest('button, a')) return
							goto(trackHref)
						}}
					>
						<TrackCard track={displayTrack} {deckId} showMenu={false} />
					</div>
				{/if}
				<div class="channel-panel">
					{#if headerChannel}
						<ChannelMicroCard
							channel={headerChannel}
							href={appState.embed_mode
								? undefined
								: resolve('/[slug]', {slug: headerChannel.slug})}
						/>
					{/if}
					{#if secondaryChannel}
						<ChannelMicroCard
							channel={secondaryChannel}
							href={appState.embed_mode
								? undefined
								: resolve('/[slug]', {slug: secondaryChannel.slug})}
						/>
					{/if}
				</div>
			</div>
			{#if !deck?.listening_to_channel_id && !deck?.auto_radio}
				<SpeedControl {deckId} {provider} />
			{/if}
			<menu class="deck-transport">
				{#if !deck?.listening_to_channel_id && !deck?.auto_radio}
					<button
						onclick={() => previous(deckId, 'user_prev')}
						aria-label={m.player_compact_prev()}
						disabled={!canPrevFromQueue}
						{@attach tooltip({content: m.player_tooltip_prev() + shortcutHint('previousTrack')})}
					>
						<Icon icon="previous-fill" />
					</button>
					<button
						class="play"
						class:active={deck?.is_playing}
						onclick={() => togglePlayPause(deckId)}
						aria-label={m.player_compact_play_pause()}
						disabled={!canPlayFromQueue}
						{@attach tooltip({
							content:
								(deck?.is_playing ? m.player_tooltip_pause() : m.player_tooltip_play()) +
								shortcutHint('togglePlayPause')
						})}
					>
						<Icon icon={deck?.is_playing ? 'pause' : 'play-fill'} />
					</button>
					<button
						onclick={() => next(deckId, 'user_next')}
						aria-label={m.player_compact_next()}
						disabled={!canNextFromQueue}
						{@attach tooltip({content: m.player_tooltip_next() + shortcutHint('nextTrack')})}
					>
						<Icon icon="next-fill" />
					</button>
					<VolumeControl {deckId} />
					{#if activeQueue.length > 2}
						<button
							onclick={() => toggleShuffle(deckId)}
							class:active={deck?.shuffle}
							aria-label={m.player_tooltip_shuffle()}
							{@attach tooltip({
								content: m.player_tooltip_shuffle() + shortcutHint('toggleShuffle')
							})}
						>
							<Icon icon="shuffle" />
						</button>
					{/if}
					{#if display.autoRadioAvailable}
						<AutoRadioButton size={14} onclick={() => rejoinAutoRadio(deckId)} />
					{/if}
				{:else if deck?.auto_radio}
					<button
						class="play"
						class:active={deck?.is_playing}
						onclick={() => togglePlayPause(deckId)}
						aria-label={m.player_compact_play_pause()}
						disabled={!canPlayFromQueue}
						{@attach tooltip({
							content:
								(deck?.is_playing ? m.player_tooltip_pause() : m.player_tooltip_play()) +
								shortcutHint('togglePlayPause')
						})}
					>
						<Icon icon={deck?.is_playing ? 'pause' : 'play-fill'} />
					</button>
					<VolumeControl {deckId} />
					<AutoRadioButton
						live
						drifted={!!deck?.auto_radio_drifted}
						size={14}
						count={modePresenceCount}
						onclick={() =>
							deck?.auto_radio_drifted ? resyncAutoRadio(deckId) : leaveAutoRadio(deckId)}
					/>
				{:else if !deck?.listening_to_channel_id}
					<VolumeControl {deckId} />
				{/if}
			</menu>
			<menu class="deck-actions">
				{#if showEdgeControls && (!deck?.listening_to_channel_id || isListeningGroupControlDeck)}
					<PopoverMenu
						align="end"
						valign="top"
						closeOnClick={false}
						btnClass="ghost"
						bind:this={deckMenu}
					>
						{#snippet trigger()}
							<Icon icon="options-horizontal" />
						{/snippet}
						<DeckMenu
							{deckId}
							compact
							track={displayTrack}
							channel={displayChannel}
							{trackHref}
							canEditTrack={canEditTrackChannel}
							autoRadioAvailable={display.autoRadioAvailable}
							closeMenu={() => deckMenu?.close()}
						/>
					</PopoverMenu>
				{/if}
				{#if showEdgeControls && isListeningGroupControlDeck}
					<button
						class="expand"
						onclick={() => toggleDeckCompact(deckId)}
						aria-label={m.player_compact_show_panel()}
						{@attach tooltip({
							content: m.player_compact_show_panel() + shortcutHint('toggleCompactDeck')
						})}
					>
						<Icon icon="deck-panel" expanded />
					</button>
				{/if}
			</menu>
		</div>
	</div>
</div>

<style>
	.deck-compact-bar {
		min-height: 49px;
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		min-width: 0;
		overflow: visible;
		user-select: none;
	}

	.deck-compact-bar :global(.progress) {
		min-width: 0;
		padding: 0 var(--space-2);
	}

	/* Column: the identity/transport/actions row, then progress full-width below. */
	.deck-inner {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1 1 auto;
		width: 100%;
		min-height: 2rem;
		padding-block: var(--space-1);
	}

	/* Flex, not grid: identity takes whatever transport/actions don't need instead
	   of a fixed column ratio — a near-empty transport (mini player: just Play) no
	   longer reserves space it isn't using. Never wraps — identity shrinks instead. */
	.deck-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		padding-inline: var(--space-2);
	}

	.deck-identity {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		flex: 1 1 auto;
	}

	.deck-row > :global(.speed) {
		flex: 0 1 7rem;
		min-width: 0;
		max-width: 9rem;
	}

	.channel-panel {
		display: flex;
		align-items: center;
		flex-wrap: nowrap;
		gap: var(--space-1);
		flex: 0 1 auto;
		min-width: 0;
		max-width: 45%;
		overflow-x: auto;
		scrollbar-width: none;
		align-self: center;
	}

	.channel-panel::-webkit-scrollbar {
		display: none;
	}

	:global(.channel-panel .channel-micro-card) {
		--track-artwork-size: 1rem;
		flex: 0 1 auto;
		min-width: 6rem;
		max-width: max-content;
		align-self: center;
		background: none;
		border: none;
	}

	.track-panel {
		flex: 1 1 auto;
		min-width: 0;
		cursor: pointer;
	}

	.deck-transport,
	.deck-actions {
		display: flex;
		align-items: center;
		flex-wrap: nowrap;
		gap: var(--space-2);
		min-width: 0;
		flex: 0 0 auto;
	}

	.deck-transport {
		justify-content: center;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.deck-actions {
		justify-content: flex-end;
	}

	.deck-transport::-webkit-scrollbar {
		display: none;
	}

	.deck-transport :global(.volume) {
		flex: 1 1 7rem;
		min-width: 0;
		max-width: 10rem;
	}

	.deck-transport :global(.volume .range),
	.deck-transport :global(.volume media-mute-button),
	.deck-transport :global(.volume .btn) {
		min-width: 0;
	}

	.expand {
		flex: 0 0 auto;
		align-self: center;
		order: 3;
	}

	.track-panel :global(article) {
		height: 100%;
		outline: 0;
		outline-offset: 0;
	}

	.track-panel :global(.card) {
		padding: 0;
	}

	.track-panel :global(h3 + p) {
		max-width: 100%;
	}

	@media (max-width: 768px) {
		.deck-inner {
			padding-inline: var(--space-1);
		}

		:global(.channel-panel .channel-micro-card .slug) {
			max-width: 15ch;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		/* Tapping the bar expands the deck on mobile — hide the duplicate */
		.expand {
			display: none;
		}
	}

	/* Mini player: channel + track + play on one row, progress below.
	   Hidden via CSS only — everything stays in the DOM. Above
	   1024px: the full desktop bar. */
	@media (max-width: 1024px) {
		/* Progress is display-only here; taps reach the bar's expansion handler. */
		.deck-compact-bar :global(.progress input) {
			pointer-events: none;
		}

		.deck-transport > :global(*:not(.play)) {
			display: none;
		}

		.deck-row > :global(.speed) {
			display: none;
		}
	}

	@media (min-width: 768px) {
		.deck-transport {
			overflow-x: visible;
		}

		.deck-transport :global(.volume) {
			flex: 1 1 6.75rem;
		}

		.expand {
			order: 5;
		}
	}
</style>
