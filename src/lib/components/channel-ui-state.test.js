import {describe, expect, it} from 'vitest'
import {normalizeBroadcastRow, deriveChannelActivityState} from './channel-ui-state.js'

describe('normalizeBroadcastRow', () => {
	it('normalizes direct channel_id rows', () => {
		const row = normalizeBroadcastRow({channel_id: 'c1', track_played_at: '2025-01-01T00:00:00Z'})
		expect(row.channelId).toBe('c1')
		expect(row.trackPlayedAt).toBe('2025-01-01T00:00:00Z')
	})

	it('normalizes nested channels rows', () => {
		const row = normalizeBroadcastRow({channels: {id: 'c2', slug: 'alpha'}, decks: [{track_id: 't1'}]})
		expect(row.channelId).toBe('c2')
		expect(row.channel?.slug).toBe('alpha')
		expect(row.decks).toHaveLength(1)
	})
})

describe('deriveChannelActivityState', () => {
	it('derives consistent active/favorite/live/tag state', () => {
		const state = deriveChannelActivityState({
			decks: {
				1: {playlist_title: '#house', playlist_slug: 'alpha', playlist_track: 't1', is_playing: true},
				2: {view: {tags: ['dub']}, listening_to_channel_id: 'c2'}
			},
			tracksState: new Map([['t1', {id: 't1', slug: 'alpha', tags: ['techno']}]]),
			channelsState: new Map([
				['c1', {id: 'c1', slug: 'alpha'}],
				['c2', {id: 'c2', slug: 'beta'}]
			]),
			followsState: new Map([['c1', {id: 'c1'}]]),
			broadcastRows: [{channels: {id: 'c2', slug: 'beta'}}]
		})

		expect(state.activeChannelIds).toEqual(expect.arrayContaining(['c1', 'c2']))
		expect(state.activeMentions).toEqual(expect.arrayContaining(['@alpha', '@beta']))
		expect(state.activeTags).toEqual(expect.arrayContaining(['#house', '#dub']))
		expect(state.playingChannelSlugs.has('alpha')).toBe(true)
		expect(state.favoriteChannelIds.has('c1')).toBe(true)
		expect(state.broadcastingChannelIds.has('c2')).toBe(true)
	})
})
