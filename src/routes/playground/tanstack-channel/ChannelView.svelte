<script>
	import {createQuery, useQueryClient} from '@tanstack/svelte-query'
	import {r5} from '$lib/r5'
	import {useAppState} from '$lib/app-state.svelte'
	import Tracklist from '$lib/components/tracklist.svelte'

	const appState = useAppState()
	const queryClient = useQueryClient()

	const isSignedIn = $derived(!!appState?.user)
	const canEdit = $derived(isSignedIn && appState?.channels?.includes(channelQuery.data?.id))

	let channelSlug = $state('oskar')
	let trackLimit = $state(5)

	// Query for channel data
	const channelQuery = createQuery(() => ({
		queryKey: ['channel', channelSlug],
		queryFn: async () => {
			// Try r4 first
			const r4Channels = await r5.channels.r4({slug: channelSlug})
			if (r4Channels.length) return r4Channels[0]
			// Fallback to v1
			const v1Channels = await r5.channels.v1({slug: channelSlug})
			return v1Channels[0] || null
		}
	}))

	// Query for tracks data
	const tracksQuery = createQuery(() => ({
		queryKey: ['tracks', channelSlug, trackLimit],
		queryFn: async () => {
			const channel = channelQuery.data
			if (!channel) return []

			let tracks = []
			// v1 channel
			if (channel.source === 'v1' && channel.firebase_id) {
				tracks = await r5.tracks.v1({channel: channelSlug, firebase: channel.firebase_id, limit: trackLimit})
			} else {
				// r4 channel
				tracks = await r5.tracks.r4({slug: channelSlug, limit: trackLimit})
			}

			// Add channel_slug to each track for tracklist component
			return tracks.map((t) => ({...t, channel_slug: channelSlug}))
		},
		enabled: !!channelQuery.data
	}))

	// Cast tracks data for component compatibility
	/** @type {import('$lib/types').Track[] | undefined} */
	const tracks = $derived(tracksQuery.data ? /** @type {any} */ (tracksQuery.data) : undefined)

	function getStorageSize() {
		if (typeof localStorage === 'undefined') return 0
		let total = 0
		for (let key in localStorage) {
			if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
				total += localStorage[key].length + key.length
			}
		}
		return total
	}

	let storageSize = $state(0)
	let storageMB = $derived((storageSize / 1024 / 1024).toFixed(2))

	$effect(() => {
		if (tracksQuery.data) {
			storageSize = getStorageSize()
		}
	})

	function clearCache() {
		queryClient.clear()
		localStorage.removeItem('r5-tanstack-channel-cache')
		storageSize = 0
	}

	function clearAndReload() {
		clearCache()
		location.reload()
	}
</script>

<div class="SmallContainer" style:display="flex" style:flex-direction="column" style:gap="1rem">
	<header>
		<h1>localStorage Capacity Test</h1>
		<dl class="meta">
			<dt>Size</dt>
			<dd>{storageMB} MB ({storageSize.toLocaleString()} bytes)</dd>

			{#if tracksQuery.data && tracksQuery.data.length > 0}
				<dt>Tracks loaded</dt>
				<dd>{tracksQuery.data.length}</dd>

				<dt>Est. 40k tracks</dt>
				<dd>{(((40000 / tracksQuery.data.length) * storageSize) / 1024 / 1024).toFixed(2)} MB</dd>
			{/if}
		</dl>
		<div class="row" style:gap="0.5rem" style:margin-top="1rem">
			<button onclick={clearCache}>Clear Cache</button>
			<button onclick={clearAndReload}>Clear & Reload</button>
		</div>
	</header>

	<section>
		<div class="row" style:gap="0.5rem" style:align-items="end">
			<label style:flex="1">
				Channel slug:
				<input type="text" bind:value={channelSlug} />
			</label>
			<label>
				Track limit:
				<input type="number" bind:value={trackLimit} min="5" step="5" style:width="8rem" />
			</label>
		</div>
	</section>

	{#if channelQuery.data}
		<section>
			<h2>{channelQuery.data.name}</h2>
			{#if tracksQuery.isLoading}
				<p>Loading tracks...</p>
			{:else if tracksQuery.isError}
				<p style:color="var(--red-9)">Error: {tracksQuery.error.message}</p>
			{:else if tracks}
				<Tracklist {tracks} {canEdit} />
			{/if}
		</section>
	{/if}
</div>
