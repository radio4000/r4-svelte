/** Per-deck "the user asked for this to play" flag. */
const userInitiatedPlayMap = new Map<number, boolean>()

/** Get the user-initiated play flag for a deck */
export function getUserInitiatedPlay(deckId: number) {
	return userInitiatedPlayMap.get(deckId) ?? false
}

/** Set the user-initiated play flag for a deck */
export function setUserInitiatedPlay(deckId: number, value: boolean) {
	userInitiatedPlayMap.set(deckId, value)
}

/** Remove the user-initiated play flag when a deck is destroyed. */
export function clearUserInitiatedPlay(deckId: number) {
	userInitiatedPlayMap.delete(deckId)
}
