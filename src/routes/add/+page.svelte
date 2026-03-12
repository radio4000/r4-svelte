<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import TrackForm from '$lib/components/track-form.svelte'
	import * as m from '$lib/paraglide/messages'

	const rawUrl = $derived(page?.url?.searchParams?.get('url') || '')
	const isDiscogsUrl = $derived.by(() => {
		try {
			return new URL(rawUrl).hostname.includes('discogs.com')
		} catch {
			return false
		}
	})
	const initialUrl = $derived(isDiscogsUrl ? '' : rawUrl)
	const initialDiscogsUrl = $derived(isDiscogsUrl ? rawUrl : '')
	const channel = $derived(appState.channel)
	const isSignedIn = $derived(!!appState.user)
	const canAddTrack = $derived(isSignedIn && channel)

	/** @param {{data: {url: string, title: string} | null, error: Error | null}} event */
	function handleSubmit(event) {
		const {data, error} = event
		if (error || !data) return
		if (channel) {
			goto(resolve('/[slug]', {slug: channel.slug}))
		}
	}
</script>

<svelte:head>
	<title>{m.page_title_add_track()}</title>
</svelte:head>

<article class="constrained">
	{#if canAddTrack && channel}
		<h2>{m.track_add_title()} <a href={resolve('/[slug]', {slug: channel.slug})}>@{channel.slug}</a></h2>

		<TrackForm mode="create" {channel} url={initialUrl} discogs_url={initialDiscogsUrl} onsubmit={handleSubmit} />

		<footer>
			<small><a href={resolve('/bookmarklet')}>{m.track_add_bookmarklet()}</a></small>
		</footer>
	{:else}
		<p><a href={resolve('/auth')}>{m.auth_sign_in_to_add()}</a></p>
	{/if}
</article>

<style>
	article {
		margin-inline: auto;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	h2 {
		margin: 0;
	}

	footer {
		color: var(--color-text-2);
	}
</style>
