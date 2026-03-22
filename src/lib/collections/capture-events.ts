import {createCollection} from '@tanstack/svelte-db'
import {localStorageCollectionOptions} from '@tanstack/db'
import {uuid} from '$lib/utils'
import {LOCAL_STORAGE_KEYS} from '$lib/storage-keys'
import {logger} from '$lib/logger'

const log = logger.ns('capture-events').seal()

import type {CaptureEvent} from '$lib/types'
export type {CaptureEvent}

export const captureEventsCollection = createCollection<CaptureEvent, string>(
	localStorageCollectionOptions({
		storageKey: LOCAL_STORAGE_KEYS.captureEvents,
		getKey: (item) => item.id
	})
)

export function addCaptureEvent(event: string, properties?: Record<string, unknown>): string {
	const id = uuid()
	try {
		captureEventsCollection.insert({
			id,
			event,
			properties,
			created_at: new Date().toISOString()
		})
	} catch (error) {
		log.error('Failed to add capture event', {event, error})
	}
	return id
}

export type EndData = {ms_played?: number; end_reason?: string}

export function buildEndDataMap(
	allEvents: CaptureEvent[],
	plays: CaptureEvent[]
): Map<string, EndData> {
	const endEvents = allEvents.filter((e) => e.event === 'player:track_end')
	const endByPlayId = new Map(endEvents.map((e) => [e.properties?.play_id as string, e]))
	const map = new Map<string, EndData>()
	for (const play of plays) {
		const playId = play.properties?.play_id as string
		if (!playId) continue
		const end = endByPlayId.get(playId)
		if (end) {
			map.set(play.id, {
				ms_played: end.properties?.ms_played as number | undefined,
				end_reason: end.properties?.end_reason as string | undefined
			})
		}
	}
	return map
}

export function clearCaptureEvents() {
	try {
		const ids = [...captureEventsCollection.state.keys()]
		if (!ids.length) return
		captureEventsCollection.delete(ids)
		log.info('Capture events cleared')
	} catch (error) {
		log.error('Failed to clear capture events', {error})
	}
}
