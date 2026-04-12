<script>
	import {page} from '$app/state'
	import {appState, deckAccent} from '$lib/app-state.svelte'
	import {captureEventsCollection} from '$lib/collections/capture-events'
	import {leaveBroadcast, resyncBroadcastDeck} from '$lib/broadcast'
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
			visibleListeningDeckIds.every(
				(id) => !appState.decks[id]?.listening_drifted && appState.decks[id]?.is_playing
			)
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
		expandedListeningMultiDeck && 'expanded-listening',
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
			<section class="broadcasts" aria-label={m.decks_broadcast_listeners()}>
				{#each listeningDeckIds as deckId (deckId)}
					<div class="deck-item" style:--deck-accent={deckAccent(deckIds, deckId)}>
						<Deck {deckId} />
					</div>
				{/each}
			</section>
		{/if}
	</div>
	{#if visibleListeningDeckIds.length}
		<div class="exit-mode-bar">
			<button
				type="button"
				class={['exit-mode-btn', 'sync-btn', {active: visibleListeningDecksSynced}]}
				onclick={() => visibleListeningDeckIds.forEach((id) => resyncBroadcastDeck(id))}
			>
				{#if listenPresenceCount > 0}<PresenceCount count={listenPresenceCount} />{/if}
				<Icon icon="signal" size={12} />
				{visibleListeningDecksSynced ? 'Live' : 'Sync'}
			</button>
			<button
				type="button"
				class="exit-mode-btn"
				onclick={() => visibleListeningDeckIds.forEach((id) => leaveBroadcast(id))}
			>
				<Icon icon="close" size={12} />
				{m.broadcasts_leave()}
			</button>
		</div>
	{/if}
</aside>

<style>
	.deck-strip {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		min-height: 0;
		margin: var(--interface-margin);

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

			.deck-item {
				flex: 1 1 auto;
				min-width: 0;
			}
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
						.deck:not(.compact):is(:not(.hide-video), :not(.listening):not(.auto):not(.hide-queue))
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
						.deck:not(.compact):is(:not(.hide-video), :not(.listening):not(.auto):not(.hide-queue))
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
						.deck:not(.compact):is(:not(.hide-video), :not(.listening):not(.auto):not(.hide-queue))
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
						.deck:not(.compact):is(:not(.hide-video), :not(.listening):not(.auto):not(.hide-queue))
					)
				) {
					flex: 1 1 0;
				}
			}

			.exit-mode-bar {
				padding-top: 0.2rem;
			}
		}
	}
</style>
