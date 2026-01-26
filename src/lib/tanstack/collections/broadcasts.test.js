import {describe, expect, test} from 'vitest'
import {sdk} from '@radio4000/sdk'

const BROADCAST_SELECT = `
	channel_id,
	track_id,
	track_played_at,
	channels:channels_with_tracks (*),
	tracks:channel_tracks!track_id (*)
`

describe('broadcasts', () => {
	test('broadcast query returns valid BroadcastWithChannel data', async () => {
		const {data: broadcasts, error} = await sdk.supabase.from('broadcast').select(BROADCAST_SELECT)

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
			expect(typeof broadcast.track_id).toBe('string')
			expect(typeof broadcast.track_played_at).toBe('string')

			// Channel fields (should never be null per DB constraints)
			expect(broadcast.channels).toBeDefined()
			expect(typeof broadcast.channels.id).toBe('string')
			expect(typeof broadcast.channels.name).toBe('string')
			expect(typeof broadcast.channels.slug).toBe('string')
			expect(typeof broadcast.channels.created_at).toBe('string')
			expect(typeof broadcast.channels.updated_at).toBe('string')

			// Track from channel_tracks view - has slug
			if (broadcast.tracks !== null) {
				expect(typeof broadcast.tracks.id).toBe('string')
				expect(typeof broadcast.tracks.title).toBe('string')
				expect(typeof broadcast.tracks.url).toBe('string')
				expect(typeof broadcast.tracks.slug).toBe('string')
				expect(typeof broadcast.tracks.created_at).toBe('string')
				expect(typeof broadcast.tracks.updated_at).toBe('string')
			}
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
