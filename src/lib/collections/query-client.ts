import {QueryClient} from '@tanstack/svelte-query'

/** Shared TanStack Query client for every collection; cache lives 24h to match the persisted maxAge. */
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			gcTime: 1000 * 60 * 60 * 24 // 24 hours - must match persistence maxAge
		}
	}
})
