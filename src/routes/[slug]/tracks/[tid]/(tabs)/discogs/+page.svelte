<script>
	import {getTrackDetailCtx} from '$lib/contexts'
	import TrackMetaDiscogs from '$lib/components/track-meta-discogs.svelte'
	import {pullDiscogs} from '$lib/metadata/discogs'
	import * as m from '$lib/paraglide/messages'

	const detail = getTrackDetailCtx()
	const track = $derived(detail.track)
	const channel = $derived(detail.channel)
	const canEdit = $derived(detail.canEdit)
	const tracks = $derived(detail.tracks)
	const meta = $derived(detail.meta)
	const provider = $derived(detail.trackProvider)
	const mediaId = $derived(detail.trackMediaId)
	const discogsUrl = $derived(track?.discogs_url?.trim() || null)
	const discogsData = $derived(meta?.discogs_data ?? null)
	const cachedSourceUrl = $derived(
		typeof discogsData === 'object' && discogsData && '_meta' in discogsData
			? /** @type {{sourceUrl?: string}} */ (discogsData._meta).sourceUrl || null
			: null
	)
	const hasDiscogsData = $derived(Boolean(discogsData && Object.keys(discogsData).length > 0))
	const hasMatchingDiscogsData = $derived(
		Boolean(hasDiscogsData && discogsUrl && cachedSourceUrl && cachedSourceUrl === discogsUrl)
	)
	const canPull = $derived(Boolean(discogsUrl && mediaId))
	const shouldPull = $derived(Boolean(canPull && (!hasDiscogsData || !hasMatchingDiscogsData)))
	const fetchKey = $derived(
		track?.id && mediaId && discogsUrl ? `${track.id}:${mediaId}:${discogsUrl}` : null
	)

	let loading = $state(false)
	let error = $state('')
	let attemptedKey = $state('')

	$effect(() => {
		const activeDiscogsUrl = discogsUrl
		const activeMediaId = mediaId
		if (!fetchKey || !shouldPull || !activeDiscogsUrl || !activeMediaId) {
			loading = false
			error = ''
			return
		}
		if (attemptedKey === fetchKey) return

		const requestKey = fetchKey
		attemptedKey = requestKey
		loading = true
		error = ''
		let cancelled = false

		Promise.resolve().then(async () => {
			try {
				await pullDiscogs(provider, activeMediaId, activeDiscogsUrl)
			} catch (err) {
				if (!cancelled) {
					error = `Discogs metadata unavailable: ${err instanceof Error ? err.message : String(err)}`
				}
			} finally {
				// Always clear loading for this same request key, even if this run got
				// cancelled by a reactive re-run (prevents stuck loading state).
				if (attemptedKey === requestKey) {
					loading = false
				}
			}
		})

		return () => {
			cancelled = true
		}
	})
</script>

{#if hasDiscogsData && (!discogsUrl || hasMatchingDiscogsData)}
	<TrackMetaDiscogs {track} {tracks} {channel} {canEdit} {discogsData} autoload={false} />
{:else if loading}
	<p>{m.track_meta_loading()}</p>
{:else if error}
	<p>{m.track_meta_error({message: error})}</p>
{:else if discogsUrl}
	<TrackMetaDiscogs
		{track}
		{tracks}
		{channel}
		{canEdit}
		discogsData={hasMatchingDiscogsData ? discogsData : null}
		autoload={true}
	/>
{:else}
	<p>{m.track_meta_no_discogs()}</p>
{/if}
