<script>
	import TrackCard from './track-card.svelte'
	import Icon from './icon.svelte'
	import {fetchDiscogs, extractSuggestions} from '$lib/metadata/discogs'
	import {setPlaylist, playTrack, playNext} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import {tracksCollection} from '$lib/tanstack/collections'
	import {isDbId} from '$lib/utils'

	/**
	 * @typedef {{position: string, type_: string, title: string, duration: string}} DiscogsTracklistItem
	 * @typedef {{uri: string, title: string, description: string, duration: number, embed: boolean}} DiscogsVideo
	 * @typedef {Object} DiscogsResource
	 * @property {string} [artists_sort]
	 * @property {{name: string}[]} [artists]
	 * @property {string} title
	 * @property {number} [year]
	 * @property {string} [released_formatted]
	 * @property {string} [country]
	 * @property {string[]} [genres]
	 * @property {string[]} [styles]
	 * @property {{name: string, catno?: string}[]} [labels]
	 * @property {{name: string, qty: string, descriptions?: string[]}[]} [formats]
	 * @property {{have: number, want: number, rating: {count: number, average: number}} } [community]
	 * @property {DiscogsTracklistItem[]} [tracklist]
	 * @property {DiscogsVideo[]} [videos]
	 * @property {string} [uri]
	 * @property {string} [thumb]
	 */

	/** @type {{
	 *   url: string,
	 *   full?: boolean,
	 *   slug?: string,
	 *   suggestions?: boolean,
	 *   preselected?: string[],
	 *   tracks?: import('$lib/types').Track[],
	 *   onload?: (suggestions: string[]) => void,
	 *   onsuggestion?: (e: {detail: string[]}) => void,
	 *   onSelectMedia?: (uri: string, title: string) => void,
	 * }} */
	let {
		url,
		full = false,
		slug = '',
		suggestions = false,
		preselected = [],
		tracks = [],
		onload,
		onsuggestion,
		onSelectMedia
	} = $props()

	/** @type {DiscogsResource | null} */
	let resource = $state(null)
	let selectedTags = $state(/** @type {string[]} */ ([]))
	let initializedForUrl = $state('')
	let selectedTrackId = $state(/** @type {string | null} */ (null))

	$effect(() => {
		if (url) {
			resource = null
			loadResource(url)
		} else {
			resource = null
		}
	})

	async function loadResource(discogsUrl) {
		try {
			resource = await fetchDiscogs(discogsUrl)
		} catch (e) {
			console.error('Error fetching discogs', e)
			resource = null
		}
	}

	$effect(() => {
		if (resource && url !== initializedForUrl) {
			const all = extractSuggestions(/** @type {DiscogsResource} */ (resource))
			const initial = preselected.filter((t) => all.includes(t))
			selectedTags = initial
			initializedForUrl = url
			onload?.(all)
		}
	})

	function handleTagChange(tag, checked) {
		if (checked) {
			selectedTags = [...selectedTags, tag]
		} else {
			selectedTags = selectedTags.filter((t) => t !== tag)
		}
		onsuggestion?.({detail: selectedTags})
	}

	/**
	 * Find matching video for a tracklist item (title substring match)
	 * @param {DiscogsTracklistItem} trackItem
	 * @param {DiscogsVideo[]} videos
	 * @returns {DiscogsVideo | undefined}
	 */
	function matchVideo(trackItem, videos) {
		if (!videos?.length) return undefined
		const needle = trackItem.title.toLowerCase().trim()
		return videos.find((v) => v.title.toLowerCase().trim().includes(needle))
	}

	/**
	 * Find a real track in the channel collection matching a video URI
	 * @param {string | undefined} videoUri
	 * @param {import('$lib/types').Track[]} channelTracks
	 * @returns {import('$lib/types').Track | null}
	 */
	function findRealTrack(videoUri, channelTracks) {
		if (!videoUri || !channelTracks?.length) return null
		const exact = channelTracks.find((t) => t.url === videoUri)
		if (exact) return exact
		const ytId = videoUri.match(/[?&]v=([^&]+)/)?.[1] ?? videoUri.match(/youtu\.be\/([^?]+)/)?.[1]
		if (ytId) return channelTracks.find((t) => t.media_id === ytId) ?? null
		return null
	}

	/**
	 * Build a synthetic ephemeral Track from a Discogs video or a no-video tracklist item.
	 * @param {DiscogsVideo | null} video
	 * @param {string} title
	 * @param {string} position
	 * @returns {import('$lib/types').Track}
	 */
	function makeEphemeralTrack(video, title, position) {
		const uri = video?.uri ?? ''
		const ytId = uri.match(/[?&]v=([^&]+)/)?.[1] ?? uri.match(/youtu\.be\/([^?]+)/)?.[1]
		const now = new Date().toISOString()
		const id = uri ? `discogs:${uri}` : `discogs-no-video:${artistsDisplay}:${position}:${title}`
		return /** @type {import('$lib/types').Track} */ ({
			id,
			title: artistsDisplay ? `${artistsDisplay} — ${title}` : title,
			url: uri,
			media_id: ytId ?? null,
			created_at: now,
			updated_at: now,
			// No slug — ephemeral tracks must not appear in channel tracksQuery (filtered by slug)
			slug: null,
			// discogs_url only on real DB tracks (drives the link in track-card)
			// Carry the release URL so "add to radio" can pre-fill the Discogs field
			discogs_url: url || null
		})
	}

	/**
	 * For each tracklist item return the best playable track:
	 * real R4 track > ephemeral video track > ephemeral no-video (broken) track.
	 * All items are included so the full release is in the playlist.
	 */
	const playableTracks = $derived.by(() => {
		if (!resource) return /** @type {import('$lib/types').Track[]} */ ([])
		const res = /** @type {DiscogsResource} */ (resource)
		return tracklistItems.map((item) => {
			const video = matchVideo(item, res.videos ?? [])
			if (!video) return makeEphemeralTrack(null, item.title, item.position)
			return findRealTrack(video.uri, tracks) ?? makeEphemeralTrack(video, item.title, item.position)
		})
	})

	/** Alias for clarity */
	const allPlayableTracks = $derived(playableTracks)

	/** Register/unregister ephemeral tracks when resource/tracks change */
	$effect(() => {
		const toRegister = allPlayableTracks.filter((t) => !isDbId(t.id))
		for (const t of toRegister) {
			tracksCollection.utils.writeUpsert(t)
		}
		return () => {
			// Only remove tracks not referenced in any deck's current playlist
			const activeDeckIds = new Set(Object.values(appState.decks).flatMap((d) => d.playlist_tracks ?? []))
			for (const t of toRegister) {
				if (!activeDeckIds.has(t.id) && tracksCollection.state.has(t.id)) {
					tracksCollection.utils.writeDelete(t.id)
				}
			}
		}
	})

	/** Play a track, setting the full release as the playlist */
	function playFromRelease(trackId) {
		const deckId = appState.active_deck_id
		const ids = allPlayableTracks.map((t) => t.id)
		if (ids.length) {
			setPlaylist(deckId, ids, {title: `${artistsDisplay} — ${resource?.title}`, slug: slug || undefined})
		}
		playTrack(deckId, trackId, null, 'user_click_track')
	}

	/** Single-click on a tracklist row — select; double-click plays (via TrackCard dblclick) */
	function handleRowClick(event, track) {
		if (!track) return
		const target = /** @type {HTMLElement} */ (event.target)
		if (target.closest('button, a, input, [role="button"]')) return
		selectedTrackId = track.id
	}

	function handlePlayRelease() {
		if (!allPlayableTracks.length) return
		playFromRelease(allPlayableTracks[0].id)
	}

	function handlePlayNext() {
		const deckId = appState.active_deck_id
		playNext(
			deckId,
			allPlayableTracks.map((t) => t.id)
		)
	}

	const suggestionsList = $derived(resource ? extractSuggestions(/** @type {DiscogsResource} */ (resource)) : [])
	const releaseMeta = $derived.by(() => {
		if (!resource) return ''
		const parts = []
		const date = resource.released_formatted || (resource.year ? String(resource.year) : '')
		if (date) parts.push(date)
		if (resource.country) parts.push(resource.country)
		const format = resource.formats?.[0]
		if (format) {
			const descParts =
				format.descriptions?.filter((d) => !d.includes('RPM') && !['Stereo', 'Mono'].includes(d)).slice(0, 2) ?? []
			const fmtStr = [format.name, ...descParts].join(' ')
			if (fmtStr) parts.push(fmtStr)
		}
		const label = resource.labels?.[0]
		if (label) {
			const catno = label.catno && label.catno !== 'none' ? ` ${label.catno}` : ''
			parts.push(`${label.name}${catno}`)
		}
		return parts.join(' · ')
	})
	const artistsDisplay = $derived(
		/** @type {DiscogsResource | null} */ (resource)?.artists_sort ||
			/** @type {DiscogsResource | null} */ (resource)?.artists?.map((a) => a.name).join(', ') ||
			''
	)
	const tracklistItems = $derived(
		resource ? /** @type {DiscogsResource} */ (resource.tracklist ?? []).filter((t) => t.type_ !== 'heading') : []
	)
</script>

{#if url && !resource}
	<div class="r4-discogs-resource r4-discogs-resource--loading">
		<Icon icon="tag" size={12} />
		<span class="caps">Loading…</span>
	</div>
{/if}

{#if resource}
	<div class="r4-discogs-resource">
		<div class="release-header">
			{#if resource.thumb}
				<img class="release-thumb" src={resource.thumb} alt="" loading="lazy" />
			{/if}
			<div class="release-info">
				<h3>
					{#if resource.uri}
						<a href={resource.uri} target="_blank" rel="noopener noreferrer">{artistsDisplay} — {resource.title}</a>
					{:else}
						{artistsDisplay} — {resource.title}
					{/if}
				</h3>
				{#if releaseMeta}
					<small class="release-meta">{releaseMeta}</small>
				{/if}
			</div>
			{#if full && allPlayableTracks.length > 0}
				<menu class="release-actions">
					<button type="button" title="Play release" onclick={handlePlayRelease}>
						<Icon icon="play-fill" size={14} />
					</button>
					<button type="button" title="Play next" onclick={handlePlayNext}>
						<Icon icon="next-fill" size={14} />
					</button>
				</menu>
			{/if}
			{#if resource.uri}
				<a
					class="discogs-link caps"
					href={resource.uri}
					target="_blank"
					rel="noopener noreferrer"
					title="View on Discogs"
				>
					<Icon icon="tag" size={12} />
					Discogs
				</a>
			{/if}
		</div>

		{#if full && resource.community}
			<div class="release-community">
				<span>{resource.community.have} have</span>
				<span>{resource.community.want} want</span>
				{#if resource.community.rating.count > 0}
					<span>{resource.community.rating.average.toFixed(2)} / 5 ({resource.community.rating.count} ratings)</span>
				{/if}
			</div>
		{/if}

		{#if full && tracklistItems.length > 0}
			<ul class="list tracklist">
				{#each tracklistItems as trackItem, i (trackItem.position + trackItem.title)}
					{@const t = playableTracks[i]}
					{@const isReal = isDbId(t.id)}
					{@const hasVideo = t.id.startsWith('discogs:') && !!t.url}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
					<li
						class="tracklist-item"
						class:has-video={hasVideo}
						class:is-real={isReal}
						onclick={(e) => handleRowClick(e, t)}
					>
						<TrackCard track={t} canEdit={false} onPlay={playFromRelease} selected={selectedTrackId === t.id}>
							{#snippet children(track)}
								{#if hasVideo && onSelectMedia}
									<button type="button" class="ghost use-btn" onclick={() => onSelectMedia?.(track.url, track.title)}>
										Use
									</button>
								{/if}
							{/snippet}
						</TrackCard>
					</li>
				{/each}
			</ul>
		{/if}

		{#if suggestions && suggestionsList.length > 0}
			<fieldset>
				<legend>Suggested tags</legend>
				{#each suggestionsList as tag (tag)}
					<label>
						<input
							type="checkbox"
							name="tags"
							value={tag}
							checked={selectedTags.includes(tag)}
							onchange={(e) => handleTagChange(tag, /** @type {HTMLInputElement} */ (e.target).checked)}
						/>
						{tag}
					</label>
				{/each}
			</fieldset>
		{/if}
	</div>
{/if}

<style>
	.r4-discogs-resource {
		display: block;
		margin: 0.5rem 0;
		font-size: var(--font-4);
		border: 1px solid var(--gray-5);
		border-radius: var(--border-radius);
		overflow: hidden;

		fieldset {
			flex-flow: row wrap;
			font-style: normal;
			padding: 0.5rem;
		}
		legend {
			float: left;
		}
	}

	.r4-discogs-resource--loading {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.5rem;
		color: var(--gray-7);
		background: var(--gray-2);
	}

	label {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		margin-right: 0.5rem;
	}

	.release-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-style: normal;
		padding: 0.35rem 0.5rem;
		background: var(--gray-2);
	}

	.release-thumb {
		width: 42px;
		height: 42px;
		object-fit: cover;
		border-radius: var(--media-radius, 3px);
		flex-shrink: 0;
	}

	.release-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.release-info h3 {
		margin: 0;
		font-size: var(--font-4);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.release-meta {
		font-size: var(--font-3);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.release-actions {
		display: flex;
		gap: 0.15rem;
		flex-shrink: 0;
	}

	.discogs-link {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0.2rem;
		color: var(--gray-8);
		text-decoration: none;
		padding: 0.15rem 0.3rem;
		border-radius: 3px;
		border: 1px solid var(--gray-5);

		&:hover {
			color: var(--gray-12);
			border-color: var(--gray-7);
		}
	}

	.release-community {
		display: flex;
		gap: 0.75rem;
		padding: 0.25rem 0.5rem;
		font-size: var(--font-3);
		border-bottom: 1px solid var(--gray-3);
	}

	.tracklist {
		margin: 0;
		font-style: normal;
		padding: 0;
	}

	.tracklist-item {
		opacity: 0.35;

		&.has-video {
			opacity: 0.75;
		}

		&.is-real {
			opacity: 1;
			cursor: pointer;
		}
	}

	.use-btn {
		font-size: var(--font-3);
		flex-shrink: 0;
	}
</style>
