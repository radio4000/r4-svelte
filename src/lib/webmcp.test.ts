import {describe, expect, test, vi} from 'vitest'

import {createWebMcpTools, registerWebMcpTools} from '$lib/webmcp'
import type {WebMcpTool} from '$lib/webmcp'

const channels = [
	{
		id: 'channel-1',
		name: 'Test Radio',
		slug: 'test-radio',
		track_count: 42
	}
]

function setup() {
	const dependencies = {
		searchChannels: vi.fn(async () => channels),
		findChannel: vi.fn(async (slug: string) => channels.find((channel) => channel.slug === slug)),
		playChannel: vi.fn(async () => {}),
		getPlayerState: vi.fn(() => ({playing: true, channel_slug: 'test-radio'})),
		controlPlayer: vi.fn(async () => {})
	}
	return {
		dependencies,
		tools: createWebMcpTools(dependencies)
	}
}

describe('WebMCP tools', () => {
	test('registers every tool when Chrome returns undefined', () => {
		const registerTool = vi.fn(
			(_tool: WebMcpTool, _options?: {signal?: AbortSignal}) => undefined
		)
		const cleanup = registerWebMcpTools({registerTool})

		expect(registerTool.mock.calls.map(([tool]) => tool.name)).toEqual([
			'search_channels',
			'play_channel',
			'get_player_state',
			'control_player'
		])
		const signal = registerTool.mock.calls[0]?.[1]?.signal
		expect(signal?.aborted).toBe(false)
		cleanup?.()
		expect(signal?.aborted).toBe(true)
	})

	test('exposes a small discovery and playback surface', () => {
		const {tools} = setup()
		expect(tools.map((tool) => tool.name)).toEqual([
			'search_channels',
			'play_channel',
			'get_player_state',
			'control_player'
		])
	})

	test('searches channels and limits untrusted output', async () => {
		const {dependencies, tools} = setup()
		const search = tools.find((tool) => tool.name === 'search_channels')
		expect(search).toBeDefined()
		if (!search) return
		const result = await search.execute({query: 'test', limit: 1})

		expect(dependencies.searchChannels).toHaveBeenCalledWith('test')
		expect(result).toEqual([
			{
				name: 'Test Radio',
				slug: 'test-radio',
				track_count: 42
			}
		])
		expect(search.annotations).toEqual({readOnlyHint: true, untrustedContentHint: true})
	})

	test('resolves a channel slug before playing', async () => {
		const {dependencies, tools} = setup()
		const play = tools.find((tool) => tool.name === 'play_channel')
		expect(play).toBeDefined()
		if (!play) return
		const result = await play.execute({slug: '@test-radio'})

		expect(dependencies.findChannel).toHaveBeenCalledWith('test-radio')
		expect(dependencies.playChannel).toHaveBeenCalledWith(channels[0])
		expect(result).toEqual({
			playing: true,
			channel_slug: 'test-radio',
			channel: {name: 'Test Radio', slug: 'test-radio'}
		})
	})

	test('controls the player and returns its resulting state', async () => {
		const {dependencies, tools} = setup()
		const control = tools.find((tool) => tool.name === 'control_player')
		expect(control).toBeDefined()
		if (!control) return

		await expect(control.execute({action: 'next'})).resolves.toEqual({
			action: 'next',
			playing: true,
			channel_slug: 'test-radio'
		})
		expect(dependencies.controlPlayer).toHaveBeenCalledWith('next')
	})
})
