<script>
	import {getTrackDetailCtx} from '$lib/contexts'
	import TrackMetaYoutube from '$lib/components/track-meta-youtube.svelte'
	import {ensureYouTubeMeta} from '$lib/metadata/pull-track-meta'
	import {deriveTrackMedia} from '$lib/metadata/track-media'
	import * as m from '$lib/paraglide/messages'

	const detail = getTrackDetailCtx()
	const track = $derived(detail.track)
	const channel = $derived(detail.channel)
	const meta = $derived(detail.meta)
	const youtubeData = $derived(meta?.youtube_data)
	const hasYoutubeInfo = $derived(Boolean(youtubeData && Object.keys(youtubeData).length > 0))
	const media = $derived(deriveTrackMedia(track))
	const isYoutubeTrack = $derived(media.provider === 'youtube')
	const fetchKey = $derived(track?.id && media.mediaId ? `${track.id}:${media.mediaId}` : null)

	let loading = $state(false)
	let error = $state('')
	let attemptedKey = $state('')

	$effect(() => {
		if (!fetchKey || !isYoutubeTrack || hasYoutubeInfo) {
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
			const result = await ensureYouTubeMeta(track, channel)
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

{#if hasYoutubeInfo}
	<TrackMetaYoutube data={youtubeData} />
{:else if loading}
	<p>{m.track_meta_loading()}</p>
{:else if error}
	<p>{m.track_meta_error({message: error})}</p>
{:else}
	<p>No YouTube information.</p>
{/if}
