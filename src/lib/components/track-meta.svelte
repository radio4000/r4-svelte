<script>
	import {logger} from '$lib/logger'
	import {huntDiscogs, pullDiscogs} from '$lib/metadata/discogs'
	import {pullMusicBrainz} from '$lib/metadata/musicbrainz'
	import {pullYouTubeSingle} from '$lib/metadata/youtube'
	import {trackMetaCollection, updateTrack} from '$lib/tanstack/collections'
	import * as m from '$lib/paraglide/messages'

	const log = logger.ns('track-meta').seal()

	/**
	 * This component updates the track_meta table for this track
	 * with youtube_data, musicbrainz_data, and discogs_data
	 */

	/** @type {{track: import('$lib/types').TrackWithMeta, channel?: import('$lib/types').Channel, showResult?: boolean, onResult?: (result: any) => void}} */
	const {track, channel, showResult = false, onResult} = $props()

	let loading = $state(false)
	let error = $state()

	const ytid = $derived(track?.youtube_data?.id || track?.media_id || null)

	let result = $state()

	$effect(() => {
		if (!ytid) return
		loading = true
		Promise.resolve().then(async () => {
			try {
				const existing = trackMetaCollection.get(ytid)

				// Parallel harvest phase — each catches independently so one failure doesn't block the rest
				const [youtube_data, musicbrainz_data] = await Promise.all([
					!existing?.youtube_data
						? pullYouTubeSingle(ytid).catch((err) => {
								log.error('youtube failed', err)
								return null
							})
						: null,
					!existing?.musicbrainz_data
						? pullMusicBrainz(ytid, track.title).catch((err) => {
								log.error('musicbrainz failed', err)
								return null
							})
						: null
				])

				const meta = trackMetaCollection.get(ytid)
				if (meta?.youtube_data?.duration && !track.duration && channel) {
					updateTrack(channel, track.id, {duration: meta.youtube_data.duration})
				}

				// Sequential follow-up for discogs
				let discogs_data = null

				if (!existing?.discogs_data) {
					if (track.discogs_url) {
						log.info('fetching discogs', {discogs_url: track.discogs_url})
						discogs_data = await pullDiscogs(ytid, track.discogs_url)
						log.info('discogs result', {discogs_data})
					} else {
						log.info('hunting discogs url', {title: track.title})
						const discoveredUrl = await huntDiscogs(track.id, ytid, track.title)

						if (discoveredUrl) {
							log.info('found discogs url', {url: discoveredUrl})
							discogs_data = await pullDiscogs(ytid, discoveredUrl)
						}
					}
				}

				result = {
					youtube_data: youtube_data || meta?.youtube_data,
					musicbrainz_data: musicbrainz_data || meta?.musicbrainz_data,
					discogs_data: discogs_data || meta?.discogs_data
				}
				log.info('metadata updated', result)
				onResult?.(result)
			} catch (err) {
				error = err instanceof Error ? err.message : String(err)
			} finally {
				loading = false
			}
		})
	})
</script>

{#if loading}
	<p>{m.track_meta_loading()}</p>
{:else if error}
	<p>{m.track_meta_error({message: error})}</p>
{/if}

{#if result && showResult}
	<pre><code>{JSON.stringify(result, null, 2)}</code></pre>
{/if}
