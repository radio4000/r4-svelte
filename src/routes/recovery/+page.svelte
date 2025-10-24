<script>
	import {page} from '$app/state'
	import {
		appStateCollection,
		playHistoryCollection,
		followersCollection,
		trackMetaCollection,
		channelsCollection,
		tracksCollection
	} from '$lib/collections'
	import {delay} from '$lib/utils.ts'

	let isResetting = $state(false)
	let resetSuccess = $state(false)

	const errorMessage = $derived(page.url.searchParams.get('err'))

	async function resetDatabase() {
		isResetting = true
		try {
			// Clear all TanStack DB collections from localStorage
			localStorage.removeItem('r5-app-state')
			localStorage.removeItem('r5-play-history')
			localStorage.removeItem('r5-followers')
			localStorage.removeItem('r5-track-meta')
			localStorage.removeItem('r5-channels')
			localStorage.removeItem('r5-tracks')
			// Clear TanStack Query cache
			localStorage.removeItem('r5-tanstack-cache')

			await delay(1000)
			console.log('All collections and cache cleared from localStorage')
			resetSuccess = true
		} catch (err) {
			console.error('Reset failed:', err)
		} finally {
			isResetting = false
		}
	}
</script>

<main>
	<h1>Database recovery</h1>
	<p>You're here like here (sorry) because there was an error.</p>
	<br />
	{#if errorMessage}
		<p><em>{decodeURIComponent(errorMessage)}</em></p>
		<br />
	{/if}

	<section>
		{#if resetSuccess}
			<h3>Reset successful!</h3>
			<p><a href="/" data-sveltekit-reload>Go back to home</a></p>
		{:else if isResetting}
			<p>Resetting database...</p>
		{:else}
			<p class="row row--vcenter">
				First try to ❶ <a href="/" class="btn">Reload the app</a>
			</p>
			<br />
			<p>If that didn't work &rarr; ② Reset the database:</p>
			<button onclick={resetDatabase} disabled={isResetting} class="danger"> Reset my local database </button>
			<br />
			<br />
			<p>Resetting the database will:</p>
			<ul>
				<li>Delete all <em>local</em> data (channels, tracks, settings)</li>
				<li>Recreate a fresh database</li>
				<li>Allow you to start with fresh data from Radio4000</li>
			</ul>
			<p>Resetting will NOT delete any radios or tracks</p>
		{/if}
	</section>
</main>

<style>
	main {
		margin: 0.5rem;
	}
</style>
