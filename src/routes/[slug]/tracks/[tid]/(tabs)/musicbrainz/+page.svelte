<script>
	import {getTrackDetailCtx} from '$lib/contexts'
	import TrackMetaMusicbrainz from '$lib/components/track-meta-musicbrainz.svelte'
	import {pullMusicBrainz} from '$lib/metadata/musicbrainz'
	import * as m from '$lib/paraglide/messages'

	const detail = getTrackDetailCtx()
	const track = $derived(detail.track)
	const meta = $derived(detail.meta)
	const musicbrainzData = $derived(meta?.musicbrainz_data)
	const hasMusicbrainzInfo = $derived(
		Boolean(
			musicbrainzData && typeof musicbrainzData === 'object' && 'recording' in musicbrainzData
		)
	)
	const provider = $derived(detail.trackProvider)
	const mediaId = $derived(detail.trackMediaId)
	const fetchKey = $derived(track?.id && mediaId ? `${track.id}:${mediaId}` : null)

	let loading = $state(false)
	let error = $state('')
	let attemptedKey = $state('')

	$effect(() => {
		if (!fetchKey || !mediaId || !track?.title || hasMusicbrainzInfo) {
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
				await pullMusicBrainz(provider, mediaId, track.title)
			} catch (err) {
				if (!cancelled) {
					error = `MusicBrainz metadata unavailable: ${err instanceof Error ? err.message : String(err)}`
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

{#if hasMusicbrainzInfo}
	<TrackMetaMusicbrainz data={musicbrainzData} {track} />
{:else if loading}
	<p>{m.track_meta_loading()}</p>
{:else if error}
	<p>{m.track_meta_error({message: error})}</p>
{:else}
	<p>{m.track_meta_no_musicbrainz()}</p>
{/if}
