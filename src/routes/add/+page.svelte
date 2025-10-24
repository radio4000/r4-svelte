<script>
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import {useAppState} from '$lib/app-state.svelte'
	import {r5} from '$lib/r5'
	import {pg} from '$lib/r5/db'

	const appState = useAppState()

	const url = $derived(page?.url?.searchParams?.get('url'))
	const channelId = $derived(appState?.channels?.length > 0 ? appState.channels[0] : undefined)
	const isSignedIn = $derived(!!appState?.user)
	const canAddTrack = $derived(isSignedIn && channelId)

	const channel = $derived.by(async () => {
		if (!channelId) return null
		return (await pg.sql`select * from channels where id = ${channelId}`).rows[0]
	})

	async function handleSubmit(event) {
		const track = event.detail.data

		try {
			const channelData = await channel
			if (channelData) {
				await r5.tracks.insert(channelData.slug, [track])
				goto(`/${channelData.slug}`)
			}
		} catch (error) {
			console.error('Failed to insert track:', error)
		}
	}
</script>

<svelte:head>
	<title>Add Track - R5</title>
</svelte:head>

{#if canAddTrack}
	<h2>
		Add track
		{#await channel then channelData}
			{#if channelData}
				to <a href={`/${channelData.slug}`}>{channelData.name}</a>
			{/if}
		{/await}
	</h2>

	<r4-track-create channel_id={channelId} {url} onsubmit={handleSubmit}></r4-track-create>
{:else}
	<p><a href="/auth">Sign in to add tracks</a></p>
{/if}
