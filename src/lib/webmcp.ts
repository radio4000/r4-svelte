import {appState} from '$lib/app-state.svelte'
import {ensureActiveDeck, next, playChannel, previous, togglePlayPause} from '$lib/api'
import {tracksCollection} from '$lib/collections/tracks'
import {logger} from '$lib/logger'
import {findChannelBySlug, searchChannelsCombined} from '$lib/search'

import type {Channel, ChannelRef} from '$lib/types'

const PLAYER_ACTIONS = ['play', 'pause', 'next', 'previous'] as const
type PlayerAction = (typeof PLAYER_ACTIONS)[number]
type WebMcpChannel = Pick<Channel, 'id' | 'name' | 'slug' | 'track_count'>

export type WebMcpTool = {
	name: string
	title: string
	description: string
	inputSchema: {
		type: 'object'
		properties: Record<string, unknown>
		required?: string[]
	}
	annotations?: {
		readOnlyHint?: boolean
		untrustedContentHint?: boolean
	}
	execute(input: Record<string, unknown>): unknown | Promise<unknown>
}

type ModelContext = {
	registerTool(tool: WebMcpTool, options?: {signal?: AbortSignal}): void | Promise<void>
}

type WebMcpDependencies = {
	searchChannels(query: string): Promise<WebMcpChannel[]>
	findChannel(slug: string): Promise<WebMcpChannel | undefined>
	playChannel(channel: ChannelRef): Promise<void>
	getPlayerState(): Record<string, unknown>
	controlPlayer(action: PlayerAction): Promise<void> | void
}

const log = logger.ns('webmcp').seal()

function isPlayerAction(value: string): value is PlayerAction {
	return PLAYER_ACTIONS.some((action) => action === value)
}

export function createWebMcpTools(dependencies: WebMcpDependencies): WebMcpTool[] {
	return [
		{
			name: 'search_channels',
			title: 'Search radio channels',
			description: 'Find Radio4000 channels by name, slug, or description.',
			inputSchema: {
				type: 'object',
				properties: {
					query: {type: 'string', description: 'Words from the channel name, slug, or description.'},
					limit: {type: 'integer', minimum: 1, maximum: 5, default: 5}
				},
				required: ['query']
			},
			annotations: {readOnlyHint: true, untrustedContentHint: true},
			async execute(input) {
				const query = String(input.query ?? '').trim()
				if (!query) throw new Error('Enter a channel search query.')
				const requestedLimit = Number(input.limit ?? 5)
				const limit = Number.isFinite(requestedLimit)
					? Math.min(5, Math.max(1, Math.floor(requestedLimit)))
					: 5
				const channels = await dependencies.searchChannels(query)
				return channels.slice(0, limit).map(({name, slug, track_count}) => ({
					name,
					slug,
					track_count
				}))
			}
		},
		{
			name: 'play_channel',
			title: 'Play a radio channel',
			description: 'Load a Radio4000 channel into the active deck and start its latest track.',
			inputSchema: {
				type: 'object',
				properties: {
					slug: {type: 'string', description: 'Exact channel slug, such as oskar.'}
				},
				required: ['slug']
			},
			async execute(input) {
				const slug = String(input.slug ?? '')
					.trim()
					.replace(/^@/, '')
				if (!slug) throw new Error('Choose a channel slug to play.')
				const channel = await dependencies.findChannel(slug)
				if (!channel) throw new Error(`Channel @${slug} was not found.`)
				await dependencies.playChannel(channel)
				return {
					...dependencies.getPlayerState(),
					channel: {name: channel.name, slug: channel.slug}
				}
			},
			annotations: {untrustedContentHint: true}
		},
		{
			name: 'get_player_state',
			title: 'Get player state',
			description: 'Show what is loaded in the active Radio4000 deck and whether it is playing.',
			inputSchema: {type: 'object', properties: {}},
			annotations: {readOnlyHint: true, untrustedContentHint: true},
			execute() {
				return dependencies.getPlayerState()
			}
		},
		{
			name: 'control_player',
			title: 'Control the player',
			description: 'Play or pause the active Radio4000 deck, or move to the next or previous track.',
			inputSchema: {
				type: 'object',
				properties: {
					action: {type: 'string', enum: ['play', 'pause', 'next', 'previous']}
				},
				required: ['action']
			},
			annotations: {untrustedContentHint: true},
			async execute(input) {
				const action = String(input.action ?? '')
				if (!isPlayerAction(action)) {
					throw new Error('Choose play, pause, next, or previous.')
				}
				await dependencies.controlPlayer(action)
				return {action, ...dependencies.getPlayerState()}
			}
		}
	]
}

function getPlayerState() {
	const deck = ensureActiveDeck()
	const track = deck.playlist_track ? tracksCollection.get(deck.playlist_track) : undefined
	return {
		deck_id: deck.id,
		playing: deck.is_playing,
		channel_slug: deck.playlist_slug ?? null,
		track: track ? {title: track.title, url: track.url} : null
	}
}

async function controlPlayer(action: PlayerAction) {
	const deck = ensureActiveDeck()
	if (!deck.playlist_track) throw new Error('No track is loaded in the active deck.')
	if (action === 'next') return next(deck.id, 'user_next')
	if (action === 'previous') return previous(deck.id, 'user_prev')
	if ((action === 'play') !== deck.is_playing) await togglePlayPause(deck.id)
}

export function registerWebMcpTools(modelContext: ModelContext | undefined = document.modelContext) {
	if (!modelContext) return
	const controller = new AbortController()
	const tools = createWebMcpTools({
		searchChannels: (query) =>
			searchChannelsCombined({query, localChannels: appState.local_channels ?? []}),
		findChannel: findChannelBySlug,
		playChannel: (channel) => playChannel(ensureActiveDeck().id, channel),
		getPlayerState,
		controlPlayer
	})
	for (const tool of tools) {
		try {
			void Promise.resolve(modelContext.registerTool(tool, {signal: controller.signal})).catch(
				(error) => log.warn('register_tool_failed', {tool: tool.name, error})
			)
		} catch (error) {
			log.warn('register_tool_failed', {tool: tool.name, error})
		}
	}
	return () => controller.abort()
}
