import {describe, expect, test} from 'vitest'
import {sdk} from '@radio4000/sdk'

/** @typedef {import('$lib/types').BroadcastWithChannel} BroadcastWithChannel */

const BROADCAST_SELECT = `
	channel_id,
	track_played_at,
	decks,
	channels:channels_with_tracks (*)
`

describe('broadcasts', () => {
	test('broadcast query returns valid BroadcastWithChannel data', async () => {
		const {data: broadcasts, error} = /** @type {{data: BroadcastWithChannel[] | null, error: any}} */ (
			await sdk.supabase.from('broadcast').select(BROADCAST_SELECT)
		)

		expect(error).toBeNull()
		expect(Array.isArray(broadcasts)).toBe(true)
		if (!broadcasts) return

		if (broadcasts.length === 0) {
			console.log('No active broadcasts - skipping field validation')
			return
		}

		for (const broadcast of broadcasts) {
			// Broadcast fields
			expect(typeof broadcast.channel_id).toBe('string')
			expect(typeof broadcast.track_played_at).toBe('string')

			// decks field — may be null if broadcast was created before migration
			if (broadcast.decks != null) {
				expect(Array.isArray(broadcast.decks)).toBe(true)
			}

			// Channel fields (should never be null per DB constraints)
			expect(broadcast.channels).toBeDefined()
			expect(typeof broadcast.channels.id).toBe('string')
			expect(typeof broadcast.channels.name).toBe('string')
			expect(typeof broadcast.channels.slug).toBe('string')
			expect(typeof broadcast.channels.created_at).toBe('string')
			expect(typeof broadcast.channels.updated_at).toBe('string')
		}
	})

	test('single broadcast query returns null for non-existent channel', async () => {
		const {data, error} = await sdk.supabase
			.from('broadcast')
			.select(BROADCAST_SELECT)
			.eq('channel_id', '00000000-0000-0000-0000-000000000000')
			.maybeSingle()

		expect(error).toBeNull()
		expect(data).toBeNull()
	})
})
