import {describe, expect, it} from 'vitest'
import {deriveChannelCanvasState} from './channel-canvas-state.js'

describe('deriveChannelCanvasState', () => {
	it('merges active tags from playlist title and view tags across decks', () => {
		const result = deriveChannelCanvasState({
			decks: {
				1: {
					playlist_title: '#House #Techno',
					view: {tags: ['Dub', '#Breaks']},
					playlist_track: 't1',
					playlist_slug: 'alpha'
				},
				2: {
					playlist_title: '#Jazz',
					playlist_track: 't2',
					listening_to_channel_id: 'ch2'
				}
			},
			tracksState: new Map([
				['t1', {id: 't1', slug: 'alpha', tags: ['Acid', '#DnB']}],
				['t2', {id: 't2', slug: 'beta', tags: ['latin']}]
			]),
			channelsState: new Map([
				['ch1', {id: 'ch1', slug: 'alpha'}],
				['ch2', {id: 'ch2', slug: 'beta'}]
			])
		})

		expect(result.activeTags).toEqual(expect.arrayContaining(['#house', '#techno', '#dub', '#breaks', '#jazz']))
		expect(result.activeChannelIds).toEqual(expect.arrayContaining(['ch1', 'ch2']))
		expect(result.activeMentions).toEqual(expect.arrayContaining(['@alpha', '@beta']))
	})

	it('normalizes full-width hashtag prefixes and trims punctuation', () => {
		const result = deriveChannelCanvasState({
			decks: {
				1: {
					view: {tags: ['＃Funk', 'disco!']},
					playlist_track: 't1'
				}
			},
			tracksState: new Map([['t1', {id: 't1', slug: 'gamma', tags: ['﹟Soul,']}]]),
			channelsState: new Map([['ch3', {id: 'ch3', slug: 'gamma'}]])
		})
		expect(result.activeTags).toEqual(expect.arrayContaining(['#funk', '#disco']))
	})
})
