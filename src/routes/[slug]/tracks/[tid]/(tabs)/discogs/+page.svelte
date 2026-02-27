<script>
	import {getTrackDetailCtx} from '$lib/contexts'
	import TrackMetaDiscogs from '$lib/components/track-meta-discogs.svelte'
	import {ensureDiscogsMeta} from '$lib/metadata/pull-track-meta'
	import {deriveTrackMedia} from '$lib/metadata/track-media'
	import * as m from '$lib/paraglide/messages'

	const detail = getTrackDetailCtx()
	const track = $derived(detail.track)
	const channel = $derived(detail.channel)
	const canEdit = $derived(detail.canEdit)
	const tracks = $derived(detail.tracks)
	const hasDiscogsInfo = $derived(detail.hasDiscogsInfo)
	const media = $derived(deriveTrackMedia(track))
	const fetchKey = $derived(track?.id && media.mediaId ? `${track.id}:${media.mediaId}` : null)

	let loading = $state(false)
	let error = $state('')
	let attemptedKey = $state('')

	$effect(() => {
		if (!fetchKey || hasDiscogsInfo) {
			loading = false
			error = ''
			return
		}
		if (attemptedKey === fetchKey) return

		attemptedKey = fetchKey
		loading = true
		error = ''
		let cancelled = false

		Promise.resolve().then(async () => {
			const result = await ensureDiscogsMeta(track)
			if (cancelled) return
			if (result.error) {
				error = result.error
			}
			loading = false
		})

		return () => {
			cancelled = true
		}
	})
</script>

{#if hasDiscogsInfo}
	<TrackMetaDiscogs {track} {tracks} {channel} {canEdit} />
{:else if loading}
	<p>{m.track_meta_loading()}</p>
{:else if error}
	<p>{m.track_meta_error({message: error})}</p>
{:else}
	<p>No Discogs information.</p>
{/if}
