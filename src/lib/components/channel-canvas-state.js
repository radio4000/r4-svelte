import {deriveChannelActivityState} from './channel-ui-state.js'

/**
 * Build shared deck-driven state for 2D/3D channel cards.
 * - active channels: all channels currently loaded in decks/listening
 * - active tags: hashtags from all deck playlist titles
 * - active mentions: @slug for channels currently active in decks
 *
 * @param {{
 *   decks: Record<string, any>,
 *   tracksState?: Map<string, any>,
 *   channelsState: Map<string, any>
 * }} params
 */
export function deriveChannelCanvasState(params) {
	const state = deriveChannelActivityState(params)
	return {
		activeChannelIds: state.activeChannelIds,
		activeChannelSlugs: state.activeChannelSlugs,
		activeTags: state.activeTags,
		activeMentions: state.activeMentions
	}
}
