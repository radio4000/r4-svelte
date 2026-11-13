import {afterEach, describe, expect, test, vi} from 'vitest'
import {appState} from '#lib/app-state.svelte.js'
import {playTrack} from '#lib/player/playback.js'
import {weeklyShuffle, epochFromTracks, toAutoTracks} from './auto-radio'
import {joinAutoRadio} from './auto-radio-actions'
import {serializeView, normalizeView, type View} from '#lib/views.js'
import type {Track} from '#lib/types.js'

// The real queue loaders; only the media element and the play itself are faked.
vi.mock('#lib/player/playback.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/player/playback.js')>()),
	playTrack: vi.fn(async () => {}),
	seekTo: vi.fn(),
	getMediaPlayer: vi.fn(() => ({duration: 300, currentTime: 0}))
}))

const tracks: Track[] = Array.from({length: 12}, (_, i) => ({
	id: `t${i}`,
	slug: 'ko002',
	title: `Track ${i}`,
	url: `https://youtube.com/watch?v=t${i}`,
	duration: 120 + i,
	created_at: new Date(Date.UTC(2024, 0, 1 + i)).toISOString(),
	updated_at: '2024-01-01T00:00:00.000Z'
})) as Track[]

const view: View = {sources: [{channels: ['ko002']}]}
const scheduleIds = () => {
	const auto = toAutoTracks(tracks)
	const seed = serializeView(normalizeView(view) ?? view)
	return weeklyShuffle(auto, epochFromTracks(auto), Date.now(), seed).tracks.map((t) => t.id)
}

afterEach(() => {
	appState.decks = {}
	vi.clearAllMocks()
})

describe('joinAutoRadio', () => {
	test('with no deck open, opens one holding the week’s schedule', async () => {
		appState.decks = {}
		appState.active_deck_id = 1
		await joinAutoRadio(1, tracks, view)

		const decks = Object.values(appState.decks)
		expect(decks).toHaveLength(1)
		const deck = decks[0]
		expect(deck.auto_radio).toBe(true)
		expect(deck.playlist_tracks).toEqual(scheduleIds())
		expect(appState.active_deck_id).toBe(deck.id)
		expect(vi.mocked(playTrack).mock.calls[0]?.[0]).toBe(deck.id)
	})
})
