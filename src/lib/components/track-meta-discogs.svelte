<script>
	import {updateTrack} from '$lib/tanstack/collections/tracks'
	import R4DiscogsResource from './r4-discogs-resource.svelte'
	import * as m from '$lib/paraglide/messages'

	/** @type {{
	 *   track?: import('$lib/types').Track,
	 *   tracks?: import('$lib/types').Track[],
	 *   channel?: {id: string, slug: string},
	 *   canEdit?: boolean
	 * }} */
	let {track, tracks = [], channel, canEdit = false} = $props()

	let saving = $state(false)
	let saveError = $state('')

	/** Track has a media/URL we can play */
	const trackHasMedia = $derived(!!(track?.url || track?.media_id))

	/** Called when user picks a video from the release for a track that has no URL */
	async function handleSelectMedia(uri, title) {
		if (!track || !channel) return
		saving = true
		saveError = ''
		try {
			await updateTrack(channel, track.id, {url: uri, title: title || track.title})
		} catch (e) {
			saveError = /** @type {Error} */ (e).message
		} finally {
			saving = false
		}
	}
</script>

{#if track?.discogs_url}
	<R4DiscogsResource
		url={track.discogs_url}
		full={true}
		slug={channel?.slug}
		{tracks}
		onSelectMedia={!trackHasMedia && canEdit ? handleSelectMedia : undefined}
	/>
{:else if !canEdit}
	<p>{m.track_meta_no_discogs()}</p>
{/if}

{#if saveError}
	<p class="error">{m.common_error()}: {saveError}</p>
{/if}

<style>
	.error {
		color: var(--red-6);
	}
</style>
