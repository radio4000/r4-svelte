<script>
	import {QueryClient, QueryClientProvider} from '@tanstack/svelte-query'
	import {persistQueryClient} from '@tanstack/query-persist-client-core'
	import {createSyncStoragePersister} from '@tanstack/query-sync-storage-persister'
	import ChannelView from './ChannelView.svelte'

	// Create persister for localStorage
	const persister = createSyncStoragePersister({
		storage: typeof window !== 'undefined' ? window.localStorage : undefined,
		key: 'r5-tanstack-channel-cache'
	})

	// Create QueryClient with persistence config
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				gcTime: 1000 * 60 * 60 * 24, // 24 hours
				staleTime: 1000 * 60 * 5, // 5 minutes - allows refetch on param changes
				refetchOnMount: false,
				refetchOnWindowFocus: false
			}
		}
	})

	if (typeof window !== 'undefined') {
		persistQueryClient({
			queryClient,
			persister,
			maxAge: Infinity
		})
	}
</script>

<QueryClientProvider client={queryClient}>
	<ChannelView />
</QueryClientProvider>
