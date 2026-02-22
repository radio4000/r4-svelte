import {QueryClient} from '@tanstack/svelte-query'

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			gcTime: 1000 * 60 * 60 * 24 // 24 hours - must match persistence maxAge
		}
	}
})
