import {createCollection} from '@tanstack/svelte-db'
import {queryCollectionOptions} from '@tanstack/query-db-collection'
import {sdk} from '@radio4000/sdk'
import {queryClient} from './query-client'

export interface Tag {
	tag: string
	count: number
}

export const tagsCollection = createCollection<Tag, string>(
	queryCollectionOptions({
		queryKey: ['tags'],
		queryClient,
		getKey: (item) => item.tag,
		staleTime: 60 * 60 * 1000,
		queryFn: async () => {
			// @ts-expect-error — 'tags' is a DB view not in generated types
			const {data, error} = await sdk.supabase.from('tags').select('tag, count').order('count', {ascending: false})
			if (error) throw error
			return (data ?? []) as unknown as Tag[]
		}
	})
)
