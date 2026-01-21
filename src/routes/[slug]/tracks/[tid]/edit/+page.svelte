<script>
	import {goto} from '$app/navigation'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {eq} from '@tanstack/db'
	import {appState} from '$lib/app-state.svelte'
	import {tracksCollection, channelsCollection} from '$lib/tanstack/collections'
	import TrackForm from '$lib/components/track-form.svelte'
	import * as m from '$lib/paraglide/messages'

	let {data} = $props()

	const tracksQuery = useLiveQuery((q) =>
		q
			.from({tracks: tracksCollection})
			.where(({tracks}) => eq(tracks.slug, data.slug))
			.orderBy(({tracks}) => tracks.created_at)
	)

	const channelQuery = useLiveQuery((q) =>
		q
			.from({channels: channelsCollection})
			.where(({channels}) => eq(channels.slug, data.slug))
			.orderBy(({channels}) => channels.created_at)
			.limit(1)
	)

	const track = $derived(tracksQuery.data?.find((t) => t.id === data.tid))
	const channel = $derived(channelQuery.data?.[0])
	const isSignedIn = $derived(!!appState.user)
	const canEdit = $derived(isSignedIn && appState.channels?.includes(channel?.id))
	const isLoading = $derived(tracksQuery.isLoading || channelQuery.isLoading)

	function handleSubmit(event) {
		if (event.error) return
		goto(`/${data.slug}/tracks/${data.tid}`)
	}
</script>

<svelte:head>
	<title>{m.track_edit_title()} - {track?.title || m.track_meta_title()}</title>
</svelte:head>

<article class="constrained focused">
	{#if isLoading}
		<p>Loading...</p>
	{:else if !track || !channel}
		<p>Track not found</p>
	{:else if canEdit}
		<header>
			<h1>{m.track_edit_title()}</h1>
			<p><a href="/{channel.slug}">@{channel.slug}</a> / <a href="/{data.slug}/tracks/{data.tid}">{track.title}</a></p>
		</header>

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

		<p><a href="/{data.slug}/tracks/{data.tid}/delete">{m.common_delete()} track</a></p>
	{:else if !isSignedIn}
		<p><a href="/auth">{m.auth_sign_in_to_edit()}</a></p>
	{:else}
		<p>You don't have permission to edit this track.</p>
	{/if}
</article>
