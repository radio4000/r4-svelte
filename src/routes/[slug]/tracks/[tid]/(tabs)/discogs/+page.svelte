<script>
	import {getTrackDetailCtx} from '$lib/contexts'
	import TrackMetaDiscogs from '$lib/components/track-meta-discogs.svelte'
	import {huntDiscogs, pullDiscogs} from '$lib/metadata/discogs'
	import * as m from '$lib/paraglide/messages'

	const detail = getTrackDetailCtx()
	const track = $derived(detail.track)
	const channel = $derived(detail.channel)
	const canEdit = $derived(detail.canEdit)
	const tracks = $derived(detail.tracks)
	const hasDiscogsInfo = $derived(detail.hasDiscogsInfo)
	const provider = $derived(detail.trackProvider)
	const mediaId = $derived(detail.trackMediaId)
	const fetchKey = $derived(track?.id && mediaId ? `${track.id}:${mediaId}` : null)

	let loading = $state(false)
	let error = $state('')
	let attemptedKey = $state('')

	$effect(() => {
		if (!fetchKey || !mediaId || !track || hasDiscogsInfo) {
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
				let discogsUrl = track.discogs_url || null
				if (!discogsUrl) {
					discogsUrl = await huntDiscogs(track.id, mediaId, track.title)
				}
				if (discogsUrl) {
					await pullDiscogs(provider, mediaId, discogsUrl)
				}
			} catch (err) {
				if (!cancelled) {
					error = `Discogs metadata unavailable: ${err instanceof Error ? err.message : String(err)}`
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

{#if hasDiscogsInfo}
	<TrackMetaDiscogs {track} {tracks} {channel} {canEdit} />
{:else if loading}
	<p>{m.track_meta_loading()}</p>
{:else if error}
	<p>{m.track_meta_error({message: error})}</p>
{:else}
	<p>No Discogs information.</p>
{/if}
