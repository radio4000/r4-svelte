<script>
	import {page} from '$app/state'
	import {scale} from 'svelte/transition'
	import {appState} from '$lib/app-state.svelte'
	import {playHistoryCollection} from '$lib/collections/play-history'
	import Deck from '$lib/components/deck.svelte'
	import * as m from '$lib/paraglide/messages'

	let deckIds = $derived(
		Object.keys(appState.decks)
			.map(Number)
			.sort((a, b) => a - b)
	)
	let showPlayer = $derived(page.url.searchParams.get('player') !== 'false')
	let hasHistory = $derived(playHistoryCollection.state.size > 0)

	let visibleDeckIds = $derived(
		deckIds.filter((id) => {
			const deck = appState.decks[id]
			if (!deck || !showPlayer) return false
			if (id !== 1) return true
			const hasContent = (deck.playlist_tracks?.length ?? 0) > 0 || Boolean(deck.playlist_track) || hasHistory
			return hasContent
		})
	)
	let listeningDeckIds = $derived(visibleDeckIds.filter((id) => Boolean(appState.decks[id]?.listening_to_channel_id)))
	let localDeckIds = $derived(visibleDeckIds.filter((id) => !appState.decks[id]?.listening_to_channel_id))
	const deckNeedsSpace = (deck) =>
		Boolean(
			deck && !deck.compact && (!deck.hide_video_player || (!deck.listening_to_channel_id && !deck.hide_queue_panel))
		)
	let localFillDeckIds = $derived(localDeckIds.filter((id) => deckNeedsSpace(appState.decks[id])))
	let listeningFillDeckIds = $derived(listeningDeckIds.filter((id) => deckNeedsSpace(appState.decks[id])))
	let totalFillDecks = $derived(localFillDeckIds.length + listeningFillDeckIds.length)
	let hasFillDecks = $derived(totalFillDecks > 0)
	let allDecksCompact = $derived(deckIds.length > 0 && deckIds.every((id) => appState.decks[id]?.compact))
	const deckTransitionMs = 200
	const deckExitMs = 0
	const deckScaleStart = 0.95
</script>

<aside class="deck-strip" class:all-compact={allDecksCompact} class:has-fill={hasFillDecks}>
	{#if localDeckIds.length}
		<section class="local" style={`--fill-count: ${localFillDeckIds.length}`}>
			{#each localDeckIds as deckId (deckId)}
				<div
					class="deck-item"
					class:compact={appState.decks[deckId]?.compact}
					class:fill={deckNeedsSpace(appState.decks[deckId])}
					in:scale={{start: deckScaleStart, duration: deckTransitionMs}}
					out:scale={{start: deckScaleStart, duration: deckExitMs}}
				>
					<Deck {deckId} />
				</div>
			{/each}
		</section>
	{/if}
	{#if listeningDeckIds.length}
		<section
			class="broadcasts"
			aria-label={m.decks_broadcast_listeners()}
			style={`--fill-count: ${listeningFillDeckIds.length}`}
		>
			{#each listeningDeckIds as deckId (deckId)}
				<div
					class="deck-item"
					class:compact={appState.decks[deckId]?.compact}
					class:fill={deckNeedsSpace(appState.decks[deckId])}
					in:scale={{start: deckScaleStart, duration: deckTransitionMs}}
					out:scale={{start: deckScaleStart, duration: deckExitMs}}
				>
					<Deck {deckId} />
				</div>
			{/each}
		</section>
	{/if}
</aside>

<style>
	.deck-strip {
		display: flex;
		flex-direction: row;
		gap: 0.3rem;
		flex-shrink: 0;
		min-height: 0;
		height: 100%;
		padding: 0.4rem;

		&:empty {
			display: none;
		}

		&.all-compact {
			height: 0;
			flex: 0 0 0;
			overflow: hidden;
		}
	}

	.local {
		display: flex;
		flex-direction: row;
		min-height: 0;
	}

	.deck-item {
		display: flex;
		min-height: 0;
		min-width: 0;
	}

	.broadcasts {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow-y: auto;
		flex: 1 1 24rem;
		min-width: min(36rem, 45vw);
	}

	.broadcasts :global(.deck.listening) {
		width: 100%;
		min-width: 0;
		flex: 1 1 auto;
	}

	@media (max-width: 768px) {
		.deck-strip {
			flex-direction: column;
			height: auto;
			overflow-y: auto;
		}

		.deck-strip:not(.all-compact) {
			flex: 0 1 auto;
			min-height: 0;
		}

		.deck-strip.has-fill:not(.all-compact) {
			flex: 1 1 0;
			min-height: 100%;
		}

		.local {
			flex-direction: column;
			min-height: 0;
		}

		.broadcasts {
			overflow-y: visible;
			flex-direction: column;
			min-width: 0;
		}

		.deck-strip.has-fill .local,
		.deck-strip.has-fill .broadcasts {
			flex: var(--fill-count, 0) 1 0;
			flex-direction: column-reverse;
			min-height: 0;
		}

		.deck-strip .deck-item.compact {
			flex: 0 0 auto;
			min-width: 0;
		}

		.deck-strip .deck-item:not(.fill) {
			flex: 0 1 auto;
			min-height: 0;
		}

		.deck-strip .deck-item.fill {
			flex: 1 1 0;
			min-height: 0;
		}
	}
</style>
