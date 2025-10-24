import {sdk} from '@radio4000/sdk'
import {debugLimit} from '$lib/r5/db'

/**
 * Radio4000 API wrapper that throws on errors instead of returning {data, error}
 * if we dont want the methods to throw, we could delete this file ideally
 */
export const r4 = {
	channels: {
		readChannels: async (limit = debugLimit) => {
			const {data, error} = await sdk.supabase
				.from('channels')
				.select('*')
				.order('updated_at', {ascending: false})
				.limit(limit)
			if (error) throw error
			return data || []
		},
		readChannel: async (slug: string) => {
			const {data, error} = await sdk.supabase.from('channels').select('*').eq('slug', slug).single()
			if (error) throw error
			return data
		},
		readUserChannels: async (...args: Parameters<typeof sdk.channels.readUserChannels>) => {
			const {data, error} = await sdk.channels.readUserChannels(...args)
			if (error) throw error
			return data
		},
		readChannelTracks: async (...args: Parameters<typeof sdk.channels.readChannelTracks>) => {
			const result = await sdk.channels.readChannelTracks(...args)
			if ('error' in result && result.error) throw result.error
			return 'data' in result ? result.data : result
		},
		readFollowings: async (...args: Parameters<typeof sdk.channels.readFollowings>) => {
			const {data, error} = await sdk.channels.readFollowings(...args)
			if (error) throw error
			return data
		},
		followChannel: async (...args: Parameters<typeof sdk.channels.followChannel>) => {
			const {data, error} = await sdk.channels.followChannel(...args)
			if (error) throw error
			return data
		}
	},

	broadcasts: {
		readBroadcastsWithChannel: async () => {
			const {data, error} = await sdk.supabase.from('broadcast').select(`
					channel_id,
					track_id,
					track_played_at,
					channels (
						id,
						name,
						slug,
						image,
						description
					)
				`)
			if (error) throw error
			return data || []
		}
	},

	users: {
		readUser: async () => {
			const {data, error} = await r4.sdk.supabase.auth.getUser()
			if (error) return null
			return data.user
		}
	},

	// Escape hatch - original SDK when you need {data, error} pattern
	sdk
}
