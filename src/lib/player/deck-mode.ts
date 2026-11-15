import type {Deck} from '#lib/types.js'

export const followsClock = (deck: Deck | undefined) =>
	Boolean(deck?.listening_to_channel_id || deck?.auto_radio)
