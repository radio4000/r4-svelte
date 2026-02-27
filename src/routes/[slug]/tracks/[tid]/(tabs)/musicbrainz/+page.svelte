<script>
	import {getTrackDetailCtx} from '$lib/contexts'
	import TrackMetaMusicbrainz from '$lib/components/track-meta-musicbrainz.svelte'
	import {ensureMusicbrainzMeta} from '$lib/metadata/pull-track-meta'
	import {deriveTrackMedia} from '$lib/metadata/track-media'
	import * as m from '$lib/paraglide/messages'

	const detail = getTrackDetailCtx()
	const track = $derived(detail.track)
	const meta = $derived(detail.meta)
	const musicbrainzData = $derived(meta?.musicbrainz_data)
	const hasMusicbrainzInfo = $derived(
		Boolean(musicbrainzData && typeof musicbrainzData === 'object' && 'recording' in musicbrainzData)
	)
	const media = $derived(deriveTrackMedia(track))
	const fetchKey = $derived(track?.id && media.mediaId ? `${track.id}:${media.mediaId}` : null)

	let loading = $state(false)
	let error = $state('')
	let attemptedKey = $state('')

	$effect(() => {
		if (!fetchKey || hasMusicbrainzInfo) {
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
			const result = await ensureMusicbrainzMeta(track)
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

{#if hasMusicbrainzInfo}
	<TrackMetaMusicbrainz data={musicbrainzData} {track} />
{:else if loading}
	<p>{m.track_meta_loading()}</p>
{:else if error}
	<p>{m.track_meta_error({message: error})}</p>
{:else}
	<p>No MusicBrainz information.</p>
{/if}
