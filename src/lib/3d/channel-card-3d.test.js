import {describe, expect, it} from 'vitest'
import {resolveChannelCardStates} from './channel-card-3d.js'

describe('resolveChannelCardStates', () => {
	const mediaItem = {id: 'ch1'}

	it('defaults to neutral state when no flags are set', () => {
		const state = resolveChannelCardStates(mediaItem, {})
		expect(state.isActive).toBe(false)
		expect(state.isSelected).toBe(false)
		expect(state.cardStyle).toBe('default')
		expect(state.borderStyles).toEqual(['default'])
	})

	it('marks active when id is present in activeIds', () => {
		const state = resolveChannelCardStates(mediaItem, {activeIds: ['ch1']})
		expect(state.isActive).toBe(true)
		expect(state.cardStyle).toBe('active')
		expect(state.borderStyles).toEqual(['active'])
		expect(state.infoStyle).toBe('active')
	})

	it('selected style dominates active border style', () => {
		const state = resolveChannelCardStates(mediaItem, {activeIds: ['ch1'], selectedId: 'ch1'})
		expect(state.isActive).toBe(true)
		expect(state.isSelected).toBe(true)
		expect(state.borderStyles).toEqual(['selected'])
	})

	it('favorite border remains dominant when card is selected/open', () => {
		const state = resolveChannelCardStates({id: 'ch1', isFavorite: true}, {selectedId: 'ch1'})
		expect(state.isFavorite).toBe(true)
		expect(state.isSelected).toBe(true)
		expect(state.borderStyles).toEqual(['favorite'])
	})

	it('playing card style dominates visual card fill', () => {
		const state = resolveChannelCardStates({id: 'ch1', isPlaying: true}, {activeIds: ['ch1']})
		expect(state.cardStyle).toBe('playing')
		expect(state.infoStyle).toBe('active')
	})

	it('live state does not change border or card style', () => {
		const state = resolveChannelCardStates({id: 'ch1', isLive: true}, {})
		expect(state.isLive).toBe(true)
		expect(state.cardStyle).toBe('default')
		expect(state.borderStyles).toEqual(['default'])
	})
})
