<script>
	import {goto} from '$app/navigation'
	import {appState} from '$lib/app-state.svelte'
	import {getTrackDetailCtx} from '$lib/contexts'
	import TrackForm from '$lib/components/track-form.svelte'
	import * as m from '$lib/paraglide/messages'

	let {data} = $props()
	const detail = getTrackDetailCtx()
	const track = $derived(detail.track)
	const channel = $derived(detail.channel)
	const canEdit = $derived(detail.canEdit)
	const isSignedIn = $derived(!!appState.user)

	function handleSubmit(event) {
		if (event.error) return
		goto(`/${data.slug}/tracks/${data.tid}`)
	}
</script>

{#if !track || !channel}
	<p>Track not found</p>
{:else if canEdit}
	<TrackForm
		mode="edit"
		channel={{id: channel.id, slug: channel.slug}}
		trackId={track.id}
		url={track.url}
		title={track.title}
		description={track.description ?? undefined}
		discogs_url={track.discogs_url ?? undefined}
		onsubmit={handleSubmit}
	/>
{:else if !isSignedIn}
	<p><a href="/auth">{m.auth_sign_in_to_edit()}</a></p>
{:else}
	<p>You don't have permission to edit this track.</p>
{/if}
