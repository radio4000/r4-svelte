/**
 * In-memory store for ephemeral/virtual tracks that are not persisted to the database.
 * Used for Discogs release videos that aren't in the Radio4000 collection.
 */
import type {Track} from '$lib/types'

export const ephemeralTracks = new Map<string, Track>()
