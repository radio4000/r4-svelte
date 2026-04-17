<script>
	import {page} from '$app/state'
	import {appState, deckAccent} from '$lib/app-state.svelte'
	import {captureEventsCollection} from '$lib/collections/capture-events'
	import {resyncBroadcastDeck} from '$lib/broadcast'
	import {channelsCollection} from '$lib/collections/channels'
	import {channelPresence} from '$lib/presence.svelte'
	import Deck from '$lib/components/deck.svelte'
	import Icon from '$lib/components/icon.svelte'
	import PresenceCount from '$lib/components/presence-count.svelte'
	import * as m from '$lib/paraglide/messages'

	let deckIds = $derived(
		Object.keys(appState.decks)
			.map(Number)
			.sort((a, b) => a - b)
	)
	let listeningDeckIds = $derived(
		deckIds.filter((id) => Boolean(appState.decks[id]?.listening_to_channel_id))
	)
	let videoMixListening = $derived(
		listeningDeckIds.some((id) =>
			Boolean(appState.decks[id]?.video_mix && !appState.decks[id]?.compact)
		)
	)
	let localDeckIds = $derived(deckIds.filter((id) => !appState.decks[id]?.listening_to_channel_id))
	let allDecksCompact = $derived(
		deckIds.length > 0 && deckIds.every((id) => appState.decks[id]?.compact)
	)
	let showPlayer = $derived(page.url.searchParams.get('player') !== 'false')
	let hasHistory = $derived(
		[...captureEventsCollection.state.values()].some((e) => e.event === 'player:track_play')
	)
	let visibleDeckIds = $derived.by(() =>
		deckIds.filter((id) => {
			const deck = appState.decks[id]
			if (!deck || deck.compact || !showPlayer) return false
			if (id !== 1) return true
			return (deck.playlist_tracks?.length ?? 0) > 0 || Boolean(deck.playlist_track) || hasHistory
		})
	)
	let singleVisibleDeck = $derived(appState.embed_mode && visibleDeckIds.length === 1)
	let singleVisibleNonCompactDeck = $derived(visibleDeckIds.length === 1)

	// Non-compact decks in live mode — shared exit bar
	let visibleListeningDeckIds = $derived(
		visibleDeckIds.filter((id) => Boolean(appState.decks[id]?.listening_to_channel_id))
	)
	let expandedListeningMultiDeck = $derived(
		visibleListeningDeckIds.length > 0 &&
			visibleDeckIds.length > 1 &&
			visibleListeningDeckIds.some((id) => Boolean(appState.decks[id]?.expanded))
	)
	let visibleListeningDecksSynced = $derived(
		visibleListeningDeckIds.length > 0 &&
			visibleListeningDeckIds.every((id) => !appState.decks[id]?.listening_drifted)
	)
	let listenPresenceCount = $derived.by(() => {
		let total = 0
		for (const id of visibleListeningDeckIds) {
			const channelId = appState.decks[id]?.listening_to_channel_id
			if (!channelId) continue
			const slug = channelsCollection.state.get(channelId)?.slug
			if (!slug) continue
			total += channelPresence[slug]?.broadcast ?? 0
		}
		return total
	})
</script>

<aside
	class={[
		'deck-strip',
		allDecksCompact && 'all-compact',
		singleVisibleDeck && 'single-visible',
		singleVisibleNonCompactDeck && 'single-visible-noncompact',
		expandedListeningMultiDeck && 'expanded-listening',
		videoMixListening && 'video-mix-listening',
		appState.embed_mode && 'embed-mode'
	]}
>
	<div class="deck-sections">
		{#if localDeckIds.length}
			<section class="local">
				{#each localDeckIds as deckId (deckId)}
					<div class="deck-item" style:--deck-accent={deckAccent(deckIds, deckId)}>
						<Deck {deckId} />
					</div>
				{/each}
			</section>
		{/if}
		{#if listeningDeckIds.length}
			<section
				class={['broadcasts', videoMixListening && 'video-mix']}
				aria-label={m.decks_broadcast_listeners()}
			>
				{#each listeningDeckIds as deckId (deckId)}
					<div class="deck-item" style:--deck-accent={deckAccent(deckIds, deckId)}>
						<Deck {deckId} />
					</div>
				{/each}
				{#if visibleListeningDeckIds.length}
					<div class="exit-mode-bar">
						<button
							type="button"
							class={['exit-mode-btn', 'sync-btn', {active: visibleListeningDecksSynced}]}
							onclick={() => visibleListeningDeckIds.forEach((id) => resyncBroadcastDeck(id))}
						>
							<Icon icon="signal" size={12} />
							{visibleListeningDecksSynced ? 'Live' : 'Sync'}
							{#if listenPresenceCount > 0}<PresenceCount count={listenPresenceCount} />{/if}
						</button>
					</div>
				{/if}
			</section>
		{/if}
	</div>
</aside>

<style>
	.deck-strip {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		min-height: 0;
		margin: var(--interface-margin);
		overflow: clip;
		border-radius: var(--border-radius);
		border-left: 1px solid var(--gray-4);

		&:empty {
			display: none;
		}

		&.all-compact {
			height: 0;
			flex: 0 0 0;
			overflow: hidden;
		}

		/* hide close button in embed mode when only one deck */
		&.embed-mode:not(:has(.deck-item:nth-child(2))) :global(.close-deck) {
			display: none;
		}

		.deck-sections {
			display: flex;
			flex-direction: row;
			gap: 0.3rem;
			flex: 1 1 auto;
			min-height: 0;
			overflow-x: auto;
			overflow-y: hidden;
		}

		.local {
			display: flex;
			flex-direction: row;
			flex: 0 0 auto;
			min-height: 0;
			min-width: max-content;
			border-radius: var(--border-radius);

			&:has(:global(.deck.broadcasting)) {
				box-shadow: inset 0 0 0 1px var(--accent-9);
			}
		}

		.broadcasts {
			display: flex;
			flex-direction: column;
			min-height: 0;
			height: 100%;
			overflow-y: auto;
			flex: 1 1 auto;
			min-width: min-content;

			:global(.deck.listening),
			:global(.deck.auto) {
				min-width: 0;
				flex: 1 1 auto;
			}

			/* Listening/auto-radio deck: lift the 25dvh video cap so it fills available height */
			:global(.deck.listening:not(.compact):not(.hide-video) .video),
			:global(.deck.auto:not(.compact):not(.hide-video) .video) {
				flex: 1 1 auto;
				min-height: 0;
				max-height: none;
				aspect-ratio: auto;
			}

			.deck-item {
				flex: 1 1 auto;
				min-width: 0;
			}
		}

		/* Video mix: stack listening deck videos into one layered viewport */
		.broadcasts.video-mix {
			--video-mix-stage-height: clamp(16rem, 62dvh, 80dvh);
			--video-mix-stage-gap: 0.2rem;
			isolation: isolate;
			position: relative;
		}

		/* In mix mode, deck rows should only use their intrinsic chrome height */
		.broadcasts.video-mix .deck-item {
			flex: 0 0 auto;
		}

		/* Reserve one shared stage below all listening deck rows */
		.broadcasts.video-mix::after {
			content: '';
			display: block;
			height: var(--video-mix-stage-height);
			margin-top: var(--video-mix-stage-gap);
			background: black;
			border-radius: var(--border-radius);
		}

		.broadcasts.video-mix :global(.deck.listening.video-mix) {
			position: static;
			overflow: visible;
			min-width: 200px;
			height: auto;
			min-height: 0;
		}

		/* Compact the per-deck chrome so the shared video stage can grow */
		.broadcasts.video-mix :global(.deck.listening.video-mix .header-top) {
			padding: 0.2rem 0.35rem;
			gap: 0.25rem;
		}

		.broadcasts.video-mix :global(.deck.listening.video-mix .bottom-chrome) {
			border-top-width: 0;
		}

		.broadcasts.video-mix :global(.deck.listening.video-mix .track-panel article) {
			padding-block: 0.18rem;
		}

		.broadcasts.video-mix :global(.deck.listening.video-mix .controls) {
			padding: 0.22rem 0.35rem 0.3rem;
			gap: 0.15rem;
		}

		.broadcasts.video-mix :global(.deck.listening.video-mix .video-hidden-placeholder) {
			display: none;
		}

		.broadcasts.video-mix :global(.deck.listening.video-mix .video) {
			position: absolute;
			inset-block-end: 0;
			inset-inline: 0;
			width: 100%;
			height: var(--video-mix-stage-height);
			max-height: none;
			aspect-ratio: auto;
			opacity: var(--video-mix-opacity, 1);
			transition:
				opacity 120ms ease,
				filter 220ms ease;
			z-index: var(--video-mix-z, 10);
			pointer-events: none;
			mix-blend-mode: screen;
			filter: saturate(1.2) contrast(1.08) brightness(0.95);
		}

		.broadcasts.video-mix .deck-item:nth-child(2n) :global(.deck.listening.video-mix .video) {
			mix-blend-mode: lighten;
			filter: hue-rotate(-8deg) saturate(1.25) contrast(1.1) brightness(0.92);
		}

		.broadcasts.video-mix .deck-item:nth-child(3n) :global(.deck.listening.video-mix .video) {
			mix-blend-mode: color-dodge;
			filter: hue-rotate(10deg) saturate(1.15) contrast(1.12) brightness(0.9);
		}

		.deck-item {
			display: flex;
			flex: 1 1 auto;
			min-height: 0;
			min-width: 0;

			/* Compact decks keep media alive but must not reserve strip width. */
			&:has(:global(.deck.compact)) {
				flex: 0 0 0;
				width: 0;
				min-width: 0;
				overflow: hidden;
			}
		}

		/* When an expanded deck is present, non-expanded siblings must not grow */
		.local:has(:global(.deck.expanded:not(.compact))) .deck-item {
			flex: 0 0 auto;
		}

		/* Expanded decks should always consume available strip space */
		.deck-item:has(:global(.deck.expanded:not(.compact))) {
			flex: 1 1 0;
			width: 100%;
			min-width: 0;
			min-height: 0;
		}

		.local:has(:global(.deck.expanded:not(.compact))) {
			flex: 1 1 auto;
			min-width: 0;
			width: 100%;
		}

		.exit-mode-bar {
			display: flex;
			padding: 0.3rem 0.4rem 0;
			flex-shrink: 0;
		}

		.exit-mode-btn {
			flex: 1;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 0.3rem;
			font-size: var(--font-2);
			padding: 0.25rem 0.6rem;
			border-radius: var(--border-radius);
			white-space: nowrap;
		}

		@media (min-width: 769px) {
			.deck-sections {
				width: fit-content;
				max-width: 72vw;
				min-width: 0;
			}

			.deck-sections:has(:global(.deck.expanded:not(.compact))) {
				width: 100%;
				max-width: none;
			}

			&.expanded-listening {
				.deck-sections {
					flex-direction: column;
					width: 100%;
					max-width: none;
				}

				.local,
				.broadcasts {
					width: 100%;
					min-width: 0;
				}

				:global(.deck.expanded:not(.compact)) {
					width: 100% !important;
					min-width: 0;
					flex: 1 1 auto;
				}
			}

			&.single-visible .deck-sections {
				width: 100%;
				max-width: none;
			}

			&.single-visible {
				.local,
				.broadcasts {
					flex: 1 1 auto;
					min-width: 0;
					width: 100%;
				}

				.deck-item {
					flex: 0 0 auto;

					&:has(:global(.deck:not(.compact))) {
						flex: 1 1 auto;
						min-width: 0;
					}
				}

				:global(.deck:not(.compact)) {
					width: 100% !important;
					min-width: 0;
					flex: 1 1 auto;
				}

				:global(.deck.listening:not(.compact)),
				:global(.deck.auto:not(.compact)) {
					width: 100%;
					min-width: 0;
				}
			}
		}

		/* "fill deck": non-compact with at least one visible panel (video or queue) */
		@media (max-width: 768px) {
			& {
				border-left: none;
				border-top: 1px solid var(--gray-4);
			}

			.deck-sections {
				flex-direction: column;
				height: auto;
				overflow-y: auto;
				overflow-x: hidden;
			}

			&:not(.all-compact) {
				flex: 0 1 auto;
				min-height: 0;

				/* grow to fill available height when any deck has visible content */
				&:has(
					:global(
						.deck:not(.compact):is(
								:not(.hide-video),
								.listening,
								.auto,
								:not(.listening):not(.auto):not(.hide-queue)
							)
					)
				) {
					flex: 1 1 0;
					min-height: 100%;
				}
			}

			.local {
				flex-direction: column;
				min-height: 0;
				min-width: 0;

				/* sections with fill decks share the strip height */
				&:has(
					:global(
						.deck:not(.compact):is(
								:not(.hide-video),
								.listening,
								.auto,
								:not(.listening):not(.auto):not(.hide-queue)
							)
					)
				) {
					flex: 1 1 0;
					min-height: 0;
				}
			}

			.broadcasts {
				overflow-y: visible;
				flex-direction: column;
				min-width: 0;

				/* sections with fill decks share the strip height */
				&:has(
					:global(
						.deck:not(.compact):is(
								:not(.hide-video),
								.listening,
								.auto,
								:not(.listening):not(.auto):not(.hide-queue)
							)
					)
				) {
					flex: 1 1 0;
					min-height: 0;
				}
			}

			/* deck-items: non-fill shrink but don't grow, fill items take available space */
			.deck-item {
				flex: 0 1 auto;
				min-height: 0;

				&:has(
					:global(
						.deck:not(.compact):is(
								:not(.hide-video),
								.listening,
								.auto,
								:not(.listening):not(.auto):not(.hide-queue)
							)
					)
				) {
					flex: 1 1 0;
				}
			}

			.exit-mode-bar {
				padding-top: 0.2rem;
			}

			/* One visible non-compact deck should fill height even when video is hidden */
			&.single-visible-noncompact {
				flex: 1 1 0;
				min-height: 100%;
			}

			&.single-visible-noncompact .deck-sections,
			&.single-visible-noncompact .local,
			&.single-visible-noncompact .broadcasts,
			&.single-visible-noncompact .deck-item {
				flex: 1 1 0;
				min-height: 0;
			}

			&.single-visible-noncompact :global(.deck:not(.compact)) {
				height: 100%;
			}
		}
	}
</style>
