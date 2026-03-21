import {describe, expect, it} from 'vitest'
import {deriveChannelActivityState} from './channel-ui-state.js'

describe('deriveChannelActivityState', () => {
	it('derives consistent active/favorite/live/tag state', () => {
		const state = deriveChannelActivityState({
			decks: {
				1: {
					playlist_title: '#house',
					playlist_slug: 'alpha',
					playlist_track: 't1',
					is_playing: true
				},
				2: {view: {tags: ['dub']}, listening_to_channel_id: 'c2'}
			},
			tracksState: new Map([['t1', {id: 't1', slug: 'alpha', tags: ['techno']}]]),
			channelsState: new Map([
				['c1', {id: 'c1', slug: 'alpha'}],
				['c2', {id: 'c2', slug: 'beta'}]
			]),
			followsState: new Map([['c1', {id: 'c1'}]]),
			broadcastRows: [{channel_id: 'c2'}]
		})

		expect(state.activeChannelIds).toEqual(expect.arrayContaining(['c1', 'c2']))
		expect(state.activeMentions).toEqual(expect.arrayContaining(['@alpha', '@beta']))
		expect(state.activeTags).toEqual(expect.arrayContaining(['#house', '#dub']))
		expect(state.playingChannelSlugs.has('alpha')).toBe(true)
		expect(state.favoriteChannelIds.has('c1')).toBe(true)
		expect(state.broadcastingChannelIds.has('c2')).toBe(true)
	})
})
