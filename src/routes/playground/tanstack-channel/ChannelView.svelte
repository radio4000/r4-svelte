<script>
	import {createQuery} from '@tanstack/svelte-query'
	import {r5} from '$lib/r5'
	import Tracklist from '$lib/components/tracklist.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'

	const CHANNEL_SLUG = 'oskar'

	// Query for channel data
	const channelQuery = createQuery(() => ({
		queryKey: ['channel', CHANNEL_SLUG],
		queryFn: async () => {
			const channels = await r5.channels.r4({slug: CHANNEL_SLUG})
			return channels[0] || null
		}
	}))

	// Query for tracks data
	const tracksQuery = createQuery(() => ({
		queryKey: ['tracks', CHANNEL_SLUG],
		queryFn: async () => {
			return await r5.tracks.r4({slug: CHANNEL_SLUG})
		},
		enabled: !!channelQuery.data, // Only fetch if channel exists
		refetchInterval: 1000 * 30 // Background refetch every 30s when stale
	}))

	// Cast tracks data for component compatibility
	/** @type {import('$lib/types').Track[] | undefined} */
	const tracks = $derived(tracksQuery.data ? /** @type {any} */ (tracksQuery.data) : undefined)

	// Format timestamp
	function formatTime(ms) {
		if (!ms) return 'never'
		const date = new Date(ms)
		return date.toLocaleTimeString()
	}

	// Format relative time
	function formatRelative(ms) {
		if (!ms) return 'never'
		const seconds = Math.floor((Date.now() - ms) / 1000)
		if (seconds < 60) return `${seconds}s ago`
		const minutes = Math.floor(seconds / 60)
		if (minutes < 60) return `${minutes}m ago`
		const hours = Math.floor(minutes / 60)
		return `${hours}h ago`
	}
</script>

<div class="SmallContainer">
	<header>
		<h1>TanStack Query Playground</h1>
		<p>
			Fetching channel <strong>"{CHANNEL_SLUG}"</strong> using r5 SDK + TanStack Query persistence
		</p>
		<p
			style:color="var(--green-9)"
			style:background="var(--green-3)"
			style:padding="0.5rem"
			style:border-radius="var(--border-radius)"
		>
			✓ No PGlite - using TanStack Query with localStorage persistence
		</p>
	</header>

	<!-- Channel Section -->
	<section>
		<div class="row" style:justify-content="space-between" style:align-items="center">
			<h2>Channel</h2>
			<div class="row" style:gap="0.5rem">
				{#if channelQuery.isFetching}
					<span style:color="var(--blue-9)" style:font-size="0.875rem">⟳ Fetching...</span>
				{:else if channelQuery.dataUpdatedAt}
					<span style:color="var(--gray-11)" style:font-size="0.875rem">
						Updated {formatRelative(channelQuery.dataUpdatedAt)}
					</span>
				{/if}
				<button onclick={() => channelQuery.refetch()} disabled={channelQuery.isFetching}> Refetch </button>
			</div>
		</div>

		{#if channelQuery.isLoading}
			<p style:color="var(--gray-11)">Loading channel...</p>
		{:else if channelQuery.isError}
			<p style:color="var(--red-9)" style:background="var(--red-3)" style:padding="0.5rem">
				Error: {channelQuery.error.message}
			</p>
		{:else if channelQuery.data}
			<ChannelCard channel={channelQuery.data} />
		{/if}
	</section>

	<!-- Tracks Section -->
	<section>
		<div class="row" style:justify-content="space-between" style:align-items="center">
			<h2>Tracks ({tracksQuery.data?.length || 0})</h2>
			<div class="row" style:gap="0.5rem">
				{#if tracksQuery.isFetching}
					<span style:color="var(--blue-9)" style:font-size="0.875rem">⟳ Fetching...</span>
				{:else if tracksQuery.dataUpdatedAt}
					<span style:color="var(--gray-11)" style:font-size="0.875rem">
						Updated {formatRelative(tracksQuery.dataUpdatedAt)}
					</span>
				{/if}
				<button onclick={() => tracksQuery.refetch()} disabled={tracksQuery.isFetching}> Refetch </button>
			</div>
		</div>

		{#if tracksQuery.isLoading}
			<p style:color="var(--gray-11)">Loading tracks...</p>
		{:else if tracksQuery.isError}
			<p style:color="var(--red-9)" style:background="var(--red-3)" style:padding="0.5rem">
				Error: {tracksQuery.error.message}
			</p>
		{:else if !tracksQuery.isEnabled}
			<p style:color="var(--gray-11)">Waiting for channel data...</p>
		{:else if tracks}
			<Tracklist {tracks} />
		{/if}
	</section>

	<!-- Cache Info -->
	<section>
		<h2>Cache Status</h2>
		<table style:width="100%" style:font-size="0.875rem">
			<tbody>
				<tr>
					<td style:padding="0.5rem"><strong>Channel Cache</strong></td>
					<td style:padding="0.5rem">
						{#if channelQuery.isFetching}
							Fetching...
						{:else if channelQuery.isStale}
							Stale (will refetch in background)
						{:else}
							Fresh
						{/if}
					</td>
				</tr>
				<tr>
					<td style:padding="0.5rem"><strong>Tracks Cache</strong></td>
					<td style:padding="0.5rem">
						{#if tracksQuery.isFetching}
							Fetching...
						{:else if tracksQuery.isStale}
							Stale (will refetch in background)
						{:else}
							Fresh
						{/if}
					</td>
				</tr>
				<tr>
					<td style:padding="0.5rem"><strong>Channel Updated</strong></td>
					<td style:padding="0.5rem">{formatTime(channelQuery.dataUpdatedAt)}</td>
				</tr>
				<tr>
					<td style:padding="0.5rem"><strong>Tracks Updated</strong></td>
					<td style:padding="0.5rem">{formatTime(tracksQuery.dataUpdatedAt)}</td>
				</tr>
				<tr>
					<td style:padding="0.5rem"><strong>Persistence</strong></td>
					<td style:padding="0.5rem">localStorage (24h cache, 5m stale time)</td>
				</tr>
			</tbody>
		</table>
	</section>

	<!-- Instructions -->
	<section>
		<h2>How it Works</h2>
		<ul>
			<li><strong>Initial load:</strong> Data restored instantly from localStorage (if cached)</li>
			<li><strong>Background refetch:</strong> Checks for updates every 30s when data is stale</li>
			<li><strong>On mount/focus:</strong> Validates freshness and refetches if needed</li>
			<li><strong>No PGlite:</strong> Uses r5.channels.r4() and r5.tracks.r4() directly</li>
			<li><strong>Persistence:</strong> All query results saved to localStorage automatically</li>
		</ul>
		<p
			style:color="var(--blue-9)"
			style:background="var(--blue-3)"
			style:padding="0.5rem"
			style:border-radius="var(--border-radius)"
		>
			💡 Try refreshing the page - data should appear instantly from cache!
		</p>
	</section>
</div>
