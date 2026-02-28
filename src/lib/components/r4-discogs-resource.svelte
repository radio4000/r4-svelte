<script>
	import TrackCard from './track-card.svelte'
	import Icon from './icon.svelte'
	import * as m from '$lib/paraglide/messages'
	import {fetchDiscogs, extractSuggestions} from '$lib/metadata/discogs'
	import {setPlaylist, playTrack, playNext} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import {tracksCollection} from '$lib/collections/tracks'
	import {isDbId} from '$lib/utils'

	const RE_YT_PARAM = /[?&]v=([^&]+)/
	const RE_YT_SHORT = /youtu\.be\/([^?]+)/

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
	 *   resourceData?: DiscogsResource | null,
	 *   autoload?: boolean,
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
		resourceData = null,
		autoload = true,
		suggestions = false,
		preselected = [],
		tracks = [],
		onload,
		onsuggestion,
		onSelectMedia
	} = $props()

	/** @type {DiscogsResource | null} */
	let resource = $state(null)
	let loading = $state(false)
	let loadError = $state('')
	let selectedTags = $state(/** @type {string[]} */ ([]))
	let initializedForUrl = $state('')
	let selectedTrackId = $state(/** @type {string | null} */ (null))
	let loadSeq = 0

	$effect(() => {
		if (resourceData) {
			loadSeq++
			loading = false
			loadError = ''
			resource = resourceData
			return
		}
		if (!autoload) {
			loadSeq++
			loading = false
			loadError = ''
			resource = null
		}
	})

	$effect(() => {
		if (resourceData || !autoload) return

		const discogsUrl = url?.trim() || ''
		if (discogsUrl) {
			const seq = ++loadSeq
			loading = true
			loadError = ''
			resource = null
			loadResource(discogsUrl, seq)
		} else {
			loadSeq++
			loading = false
			loadError = ''
			resource = null
		}
	})

	async function loadResource(discogsUrl, seq) {
		try {
			const data = await fetchDiscogs(discogsUrl)
			if (seq !== loadSeq) return
			resource = data
			if (!data) loadError = m.track_meta_no_discogs()
		} catch (e) {
			if (seq !== loadSeq) return
			console.error('Error fetching discogs', e)
			loadError = e instanceof Error ? e.message : String(e)
			resource = null
		} finally {
			if (seq === loadSeq) loading = false
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
		return videos.find((v) => {
			const title = v.title.toLowerCase().trim()
			return title.includes(needle) || needle.includes(title)
		})
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
		const ytId = videoUri.match(RE_YT_PARAM)?.[1] ?? videoUri.match(RE_YT_SHORT)?.[1]
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
		const ytId = uri.match(RE_YT_PARAM)?.[1] ?? uri.match(RE_YT_SHORT)?.[1]
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
	const uniqueVideos = $derived.by(() => {
		if (!resource?.videos?.length) return /** @type {DiscogsVideo[]} */ ([])
		/** @type {Record<string, boolean>} */
		const seen = {}
		return resource.videos.filter((video) => {
			if (!video?.uri || seen[video.uri]) return false
			seen[video.uri] = true
			return true
		})
	})

	const trackRows = $derived.by(() => {
		if (!resource) return []
		return tracklistItems.map((item, index) => {
			const video = matchVideo(item, uniqueVideos)
			const track = !video
				? makeEphemeralTrack(null, item.title, item.position)
				: (findRealTrack(video.uri, tracks) ?? makeEphemeralTrack(video, item.title, item.position))
			const isReal = isDbId(track.id)
			const hasVideo = !!video?.uri
			return {
				key: `${item.position}:${item.title}:${index}`,
				item,
				track,
				video,
				isReal,
				hasVideo
			}
		})
	})

	/** Alias for clarity */
	const allPlayableTracks = $derived(trackRows.map((row) => row.track))

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

	function selectedTrackTitle(trackName) {
		return artistsDisplay ? `${artistsDisplay} - ${trackName}` : trackName
	}

	const suggestionsList = $derived(resource ? extractSuggestions(/** @type {DiscogsResource} */ (resource)) : [])
	const releaseStats = $derived.by(() => {
		if (!trackRows.length) return ''
		const total = trackRows.length
		const withVideo = trackRows.filter((row) => row.hasVideo).length
		const inChannel = trackRows.filter((row) => row.isReal).length
		const parts = [`${total} tracks`]
		if (withVideo > 0) parts.push(`${withVideo} with video`)
		if (inChannel > 0) parts.push(`${inChannel} already in this channel`)
		return parts.join(' · ')
	})
	const releaseMetaItems = $derived.by(() => {
		if (!resource) return []
		/** @type {{icon: string, label: string, value: string}[]} */
		const items = []
		const date = resource.released_formatted || (resource.year ? String(resource.year) : '')
		if (date) items.push({icon: 'history', label: m.discogs_release_date(), value: date})
		if (resource.country) items.push({icon: 'map', label: m.discogs_country(), value: resource.country})
		const format = resource.formats?.[0]
		if (format) {
			const descParts =
				format.descriptions?.filter((d) => !d.includes('RPM') && !['Stereo', 'Mono'].includes(d)).slice(0, 2) ?? []
			const fmtStr = [format.name, ...descParts].join(' ')
			if (fmtStr) items.push({icon: 'tv', label: m.discogs_format(), value: fmtStr})
		}
		const label = resource.labels?.[0]
		if (label) {
			const catno = label.catno && label.catno !== 'none' ? ` ${label.catno}` : ''
			items.push({icon: 'tag', label: m.discogs_label_field(), value: `${label.name}${catno}`})
		}
		return items
	})
	const artistsDisplay = $derived(
		/** @type {DiscogsResource | null} */ (resource)?.artists_sort ||
			/** @type {DiscogsResource | null} */ (resource)?.artists?.map((a) => a.name).join(', ') ||
			''
	)
	const tracklistItems = $derived(
		/** @type {DiscogsResource | null} */ (resource)?.tracklist?.filter((t) => t.type_ !== 'heading') ?? []
	)
</script>

{#if loading}
	<div class="r4-discogs-resource r4-discogs-resource--loading">
		<Icon icon="tag" size={12} />
		<span class="caps">{m.common_loading()}</span>
	</div>
{:else if loadError}
	<p class="error">{m.common_error()}: {loadError}</p>
{/if}

{#if resource}
	<div class="r4-discogs-resource" class:r4-discogs-resource--full={full}>
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
				{#if releaseMetaItems.length > 0}
					<small class="release-meta">
						{#each releaseMetaItems as item (item.label)}
							<span title={item.label}>
								<Icon icon={item.icon} size={11} />
								{item.value}
							</span>
						{/each}
					</small>
				{/if}
			</div>
			{#if full && allPlayableTracks.length > 0}
				<menu class="release-actions">
					<button type="button" title={m.discogs_play_release()} onclick={handlePlayRelease}>
						<Icon icon="play-fill" size={14} />
					</button>
					<button type="button" title={m.discogs_play_next()} onclick={handlePlayNext}>
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
					title={m.discogs_view_on_discogs()}
				>
					<Icon icon="tag" size={12} />
					Discogs
				</a>
			{/if}
		</div>

		{#if full && (releaseStats || resource.community)}
			<div class="release-community" aria-label={m.discogs_release_summary()}>
				{#if releaseStats}
					<span>
						<Icon icon="unordered-list" size={12} />
						{releaseStats}
					</span>
				{/if}
				{#if resource.community}
					<span title={m.discogs_users_have()}>
						<Icon icon="users" size={12} />
						{m.discogs_have_count({count: resource.community.have})}
					</span>
					<span title={m.discogs_users_want()}>
						<Icon icon="favorite" size={12} />
						{m.discogs_want_count({count: resource.community.want})}
					</span>
				{/if}
				{#if Number(resource.community?.rating?.count) > 0}
					<span title={m.discogs_avg_rating()}>
						<Icon icon="chart-scatter" size={12} />
						{(resource.community?.rating?.average ?? 0).toFixed(2)} / 5 ({m.discogs_ratings_count({
							count: resource.community?.rating?.count ?? 0
						})})
					</span>
				{/if}
			</div>
		{/if}

		{#if full && tracklistItems.length > 0}
			<ul class="list tracklist">
				{#each trackRows as row (row.key)}
					{@const track = row.track}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
					<li
						class="tracklist-item"
						class:has-video={row.hasVideo}
						class:is-real={row.isReal}
						onclick={(e) => handleRowClick(e, track)}
					>
						<TrackCard
							{track}
							canEdit={false}
							onPlay={playFromRelease}
							selected={selectedTrackId === track.id}
							showImage={row.hasVideo}
						>
							{#snippet description()}
								<span class="track-hints">
									{row.item.position}{row.item.duration ? ` · ${row.item.duration}` : ''}
									{#if row.isReal}
										<small class="state state--real">{m.discogs_in_channel()}</small>
									{:else if row.hasVideo}
										<small class="state">{m.discogs_video_available()}</small>
									{:else}
										<small class="state state--muted">{m.discogs_no_video()}</small>
									{/if}
								</span>
							{/snippet}
							{#snippet children(track)}
								{#if row.hasVideo && onSelectMedia}
									<button
										type="button"
										class="ghost use-btn"
										onclick={() => onSelectMedia?.(track.url, selectedTrackTitle(row.item.title))}
									>
										{m.discogs_use_button()}
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
				<legend>{m.discogs_suggested_tags()}</legend>
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

	.r4-discogs-resource--full .release-header {
		gap: 0.75rem;
		padding: 0.7rem 0.8rem;
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
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.55rem;
	}

	.release-meta span {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		min-width: 0;
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
		flex-wrap: wrap;
		gap: 0.75rem;
		padding: 0.25rem 0.5rem;
		font-size: var(--font-3);
		border-bottom: 1px solid var(--gray-3);
	}

	.r4-discogs-resource--full .release-community {
		padding: 0.5rem 0.8rem;
	}

	.release-community span {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}

	.tracklist {
		margin: 0;
		font-style: normal;
		padding: 0;
	}

	.r4-discogs-resource--full .tracklist {
		padding: 0.25rem 0.45rem 0.45rem;
	}

	.tracklist-item {
		opacity: 0.55;

		&.has-video {
			opacity: 0.85;
		}

		&.is-real {
			opacity: 1;
			cursor: pointer;
		}
	}

	/* Keep text aligned with rows that have artwork by reserving the same slot */
	.tracklist-item:not(.has-video) :global(.card)::before {
		content: '';
		flex: 0 0 var(--track-artwork-size);
		align-self: center;
	}

	.track-hints {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: var(--font-3);
		color: var(--gray-10);
	}

	.state {
		border: 1px solid var(--gray-5);
		border-radius: 999px;
		padding: 0.05rem 0.35rem;
		font-size: var(--font-2);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.state--real {
		border-color: var(--accent-7);
		color: var(--accent-11);
	}

	.state--muted {
		color: var(--gray-8);
	}

	.use-btn {
		font-size: var(--font-3);
		flex-shrink: 0;
	}
</style>
