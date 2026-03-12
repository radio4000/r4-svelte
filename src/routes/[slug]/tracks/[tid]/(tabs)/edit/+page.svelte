<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
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
		goto(resolve('/[slug]/tracks/[tid]', {slug: data.slug, tid: data.tid}))
	}
</script>

{#if !track || !channel}
	<p>{m.track_not_found()}</p>
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
	<p><a href={resolve('/auth')}>{m.auth_sign_in_to_edit()}</a></p>
{:else}
	<p>{m.track_edit_no_permission()}</p>
{/if}
