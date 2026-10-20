/**
 * Reactive deck display state — what track and channel a deck is currently showing.
 * Centralises the `track ?? broadcastTrack ?? lastTrack` fallback chain, the
 * `channel ?? lastChannel` fallback, and the broadcast header rule. Used by
 * player.svelte and deck-compact-bar.svelte so both stay in sync.
 */

import {eq} from '@tanstack/svelte-db'
import {appState} from '#lib/app-state.svelte.js'
import {tracksCollection, watchTracks} from '#lib/collections/tracks.js'
import {channelsCollection} from '#lib/collections/channels.js'
import {broadcastsCollection} from '#lib/collections/broadcasts.js'
import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
import {unpackEphemeralTrack} from '#lib/broadcast-utils.js'
import {hasAutoRadioCoverage} from '#lib/player/auto-radio.js'
import {channelPresence} from '#lib/presence.svelte.js'
import {viewLabel} from '#lib/views.js'
import type {Channel, Track, BroadcastDeckState} from '#lib/types.js'

export interface DeckDisplay {
	readonly track: Track | undefined
	readonly channel: Channel | undefined
	readonly broadcastTrack: Track | undefined
	readonly broadcasterChannel: Channel | undefined
	readonly lastTrack: Track | undefined
	readonly lastChannel: Channel | undefined
	readonly displayTrack: Track | undefined
	readonly displayChannel: Channel | undefined
	readonly headerChannel: Channel | undefined
	readonly secondaryHeaderChannel: Channel | undefined
	readonly listenSlug: string | undefined
	readonly broadcastSlug: string | undefined
	readonly autoRadioAvailable: boolean
	readonly presenceCount: number
}

export function createDeckDisplay(deckId: number): DeckDisplay {
	const deck = $derived(appState.decks[deckId])

	// Each query below is skipped (null) until its deck field is set: two displays per
	// deck (player + compact bar) built twelve pipelines on every first play, most of
	// them filtering on '' for broadcast modes the deck wasn't in.
	const trackQuery = useLiveQuery((q) => {
		const id = deck?.playlist_track
		return id ? q.from({t: tracksCollection}).where(({t}) => eq(t.id, id)) : null
	})
	const track = $derived(trackQuery.data?.[0] as Track | undefined)

	const broadcastRowQuery = useLiveQuery((q) => {
		const id = deck?.listening_to_channel_id
		return id ? q.from({b: broadcastsCollection}).where(({b}) => eq(b.channel_id, id)) : null
	})
	const listeningBroadcastDeck = $derived.by<BroadcastDeckState | undefined>(() => {
		if (!deck?.listening_to_channel_id) return undefined
		const trackId = deck?.playlist_track
		const states = broadcastRowQuery.data?.[0]?.decks
		if (!Array.isArray(states) || !states.length) return undefined
		return (trackId && states.find((s) => s?.track_id === trackId)) || states[0]
	})

	const broadcastTrackQuery = useLiveQuery((q) => {
		const id = listeningBroadcastDeck?.track_id
		return id ? q.from({t: tracksCollection}).where(({t}) => eq(t.id, id)) : null
	})
	const broadcastTrack = $derived.by(() => {
		const state = listeningBroadcastDeck
		if (!state?.track_id) return undefined
		const loaded = broadcastTrackQuery.data?.[0] as Track | undefined
		if (loaded) return loaded
		return unpackEphemeralTrack(state.track_id, state)
	})

	const channelQuery = useLiveQuery((q) => {
		const slug = deck?.playlist_slug
		return slug ? q.from({ch: channelsCollection}).where(({ch}) => eq(ch.slug, slug)) : null
	})
	const channel = $derived(channelQuery.data?.[0] as Channel | undefined)

	const broadcasterChannelQuery = useLiveQuery((q) => {
		const id = deck?.listening_to_channel_id
		return id ? q.from({ch: channelsCollection}).where(({ch}) => eq(ch.id, id)) : null
	})
	const broadcasterChannel = $derived(broadcasterChannelQuery.data?.[0] as Channel | undefined)

	// Slug of the channel this deck is listening to; prefer the loaded channel
	// row, fall back to the channel embedded in the broadcast payload.
	const listenSlug = $derived(
		deck?.listening_to_channel_id
			? (broadcasterChannel?.slug ?? broadcastRowQuery.data?.[0]?.channels?.slug)
			: undefined
	)

	// Slug of the channel this deck is broadcasting.
	const broadcastChannelQuery = useLiveQuery((q) => {
		const id = deck?.broadcasting_channel_id
		return id ? q.from({ch: channelsCollection}).where(({ch}) => eq(ch.id, id)) : null
	})
	const broadcastSlug = $derived(
		deck?.broadcasting_channel_id
			? (broadcastChannelQuery.data?.[0]?.slug as string | undefined)
			: undefined
	)

	// URI identifying the auto-radio view this deck is playing, used to key
	// per-view presence counts (a channel can have multiple auto-radio views live).
	const autoUri = $derived(
		deck?.auto_radio && deck.playlist_slug
			? viewLabel(deck.view ?? {sources: [{channels: [deck.playlist_slug]}]}) ||
					`@${deck.playlist_slug}`
			: undefined
	)
	const presenceCount = $derived(
		deck?.listening_to_channel_id && listenSlug
			? (channelPresence[listenSlug]?.broadcast ?? 0)
			: deck?.broadcasting_channel_id && broadcastSlug
				? (channelPresence[broadcastSlug]?.broadcast ?? 0)
				: autoUri && deck?.playlist_slug
					? (channelPresence[deck.playlist_slug]?.byUri?.[autoUri] ?? 0)
					: 0
	)

	// Whether the deck's current channel has enough duration data for auto-radio.
	// Gates the join button in the deck transports (compact bar + player).
	// A scan of loaded rows, not a slug live query: that built a pipeline and copied the
	// whole channel per deck view on every play. The keep-alive pin loads the channel.
	const autoRadioAvailable = $derived.by(() => {
		const slug = deck?.playlist_slug
		if (!slug) return false
		watchTracks()
		const channelTracks: Track[] = []
		for (const t of tracksCollection.state.values()) if (t.slug === slug) channelTracks.push(t)
		return hasAutoRadioCoverage(channelTracks)
	})

	let lastTrack = $state<Track | undefined>(undefined)
	let lastChannel = $state<Channel | undefined>(undefined)
	const shouldReset = $derived(
		!deck || (!deck.playlist_track && (deck.playlist_tracks?.length ?? 0) === 0)
	)
	$effect.pre(() => {
		const current = track ?? broadcastTrack
		if (current) lastTrack = current
		else if (shouldReset) lastTrack = undefined
	})
	$effect.pre(() => {
		if (channel) lastChannel = channel
		else if (shouldReset) lastChannel = undefined
	})

	const displayTrack = $derived(track ?? broadcastTrack ?? lastTrack)
	const displayChannel = $derived(channel ?? lastChannel)

	const headerChannel = $derived(
		deck?.listening_to_channel_id ? (broadcasterChannel ?? displayChannel) : displayChannel
	)
	const secondaryHeaderChannel = $derived.by(() => {
		if (!deck?.listening_to_channel_id || !headerChannel || !displayChannel) return undefined
		const same =
			(headerChannel.id && displayChannel.id && headerChannel.id === displayChannel.id) ||
			(headerChannel.slug && displayChannel.slug && headerChannel.slug === displayChannel.slug)
		return same ? undefined : displayChannel
	})

	return {
		get track() {
			return track
		},
		get channel() {
			return channel
		},
		get broadcastTrack() {
			return broadcastTrack
		},
		get broadcasterChannel() {
			return broadcasterChannel
		},
		get lastTrack() {
			return lastTrack
		},
		get lastChannel() {
			return lastChannel
		},
		get displayTrack() {
			return displayTrack
		},
		get displayChannel() {
			return displayChannel
		},
		get headerChannel() {
			return headerChannel
		},
		get secondaryHeaderChannel() {
			return secondaryHeaderChannel
		},
		get listenSlug() {
			return listenSlug
		},
		get broadcastSlug() {
			return broadcastSlug
		},
		get autoRadioAvailable() {
			return autoRadioAvailable
		},
		get presenceCount() {
			return presenceCount
		}
	}
}
