<script>
	import {useLiveQuery} from '$lib/tanstack-svelte-db-useLiveQuery-patched.svelte.js'
	import {tracksCollection, channelsCollection} from '$lib/collections.ts'

	// Simple test: fetch tracks from tracksCollection
	const allTracks = useLiveQuery((q) => q.from({t: tracksCollection}).limit(5))

	$inspect('Query result:', {
		status: allTracks.status,
		dataType: typeof allTracks.data,
		dataLength: allTracks.data?.length,
		data: allTracks.data
	})

	console.log('tracksCollection:', tracksCollection)
	console.log('channelsCollection:', channelsCollection)
	console.log('Query status:', allTracks.status)
	console.log('Query data:', allTracks.data)
</script>

<h1>TanStack Debug - Step 1</h1>

<section>
	<h2>Collections Status</h2>
	<pre>tracksCollection defined: {!!tracksCollection}</pre>
	<pre>channelsCollection defined: {!!channelsCollection}</pre>
</section>

<section>
	<h2>Query Status</h2>
	<pre>status: {allTracks.status}</pre>
	<pre>isLoading: {allTracks.isLoading}</pre>
	<pre>isReady: {allTracks.isReady}</pre>
	<pre>data type: {typeof allTracks.data}</pre>
	<pre>data length: {allTracks.data?.length ?? 'null/undefined'}</pre>
</section>

<section>
	<h2>Raw Data</h2>
	<pre>{JSON.stringify(allTracks.data, null, 2)}</pre>
</section>
