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
				gcTime: 1000 * 60 * 60 * 24, // 24 hours - keep in cache
				staleTime: 1000 * 60 * 5, // 5 minutes - consider fresh
				refetchOnMount: true, // Check for updates on mount
				refetchOnWindowFocus: true // Check when window regains focus
			}
		}
	})

	// Set up persistence (restore on load, subscribe to changes)
	if (typeof window !== 'undefined') {
		persistQueryClient({
			queryClient,
			persister,
			maxAge: 1000 * 60 * 60 * 24 // 24 hours
		})
	}
</script>

<QueryClientProvider client={queryClient}>
	<ChannelView />
</QueryClientProvider>
