<script>
	import {getTrackDetailCtx} from '$lib/contexts'
	import TrackMetaYoutube from '$lib/components/track-meta-youtube.svelte'
	import {pullYouTubeSingle} from '$lib/metadata/youtube'
	import {updateTrack} from '$lib/collections/tracks'
	import * as m from '$lib/paraglide/messages'

	const detail = getTrackDetailCtx()
	const track = $derived(detail.track)
	const channel = $derived(detail.channel)
	const meta = $derived(detail.meta)
	const youtubeData = $derived(meta?.youtube_data)
	const hasYoutubeInfo = $derived(Boolean(youtubeData && Object.keys(youtubeData).length > 0))
	const provider = $derived(detail.trackProvider)
	const mediaId = $derived(detail.trackMediaId)
	const isYoutubeTrack = $derived(provider === 'youtube')
	const fetchKey = $derived(track?.id && mediaId ? `${track.id}:${mediaId}` : null)

	let loading = $state(false)
	let error = $state('')
	let attemptedKey = $state('')

	$effect(() => {
		if (!fetchKey || !mediaId || !isYoutubeTrack || hasYoutubeInfo) {
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
			try {
				const video = await pullYouTubeSingle(mediaId)
				if (video?.duration && track?.id && channel && !track?.duration) {
					await updateTrack(channel, track.id, {duration: Number(video.duration)})
				}
			} catch (err) {
				if (!cancelled) {
					error = `YouTube metadata unavailable: ${err instanceof Error ? err.message : String(err)}`
				}
			} finally {
				if (!cancelled) {
					loading = false
				}
			}
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
	<p>{m.track_meta_no_youtube()}</p>
{/if}
