<script>
	import {page} from '$app/state'
	import {onMount, untrack} from 'svelte'
	import {SvelteMap} from 'svelte/reactivity'
	import {cleanTitle} from 'media-now'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {getChannelCtx, getTracksQueryCtx} from '$lib/contexts'
	import {updateTrack, deleteTrack} from '$lib/collections/tracks'
	import {queryClient} from '$lib/collections/query-client'
	import {trackImageUrl} from '$lib/utils'
	import Seo from '$lib/components/seo.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import LinkEntities from '$lib/components/link-entities.svelte'
	import Icon from '$lib/components/icon.svelte'
	import Pagination from '$lib/components/pagination.svelte'

	const channelCtx = getChannelCtx()
	const tracksQuery = getTracksQueryCtx()
	const slug = $derived(page.params.slug)
	const channel = $derived(channelCtx.data)
	const canEdit = $derived(canEditChannel(channel?.id))

	onMount(() => {
		import('$lib/youtube-video-custom-element.js')
	})

	// YouTube only for now: verification and replacements are both YouTube-specific.
	const tracksWithPlaybackError = $derived(
		(tracksQuery.data ?? []).filter((t) => t.playback_error && t.provider === 'youtube')
	)
	/** One select, two kinds of option: `error:<value>` or `youtube:<status>`. Empty means all. */
	let filter = $state('')
	const errorCounts = $derived(
		tracksWithPlaybackError.reduce(
			(acc, t) => acc.set(t.playback_error, (acc.get(t.playback_error) ?? 0) + 1),
			new Map()
		)
	)
	const queue = $derived(
		tracksWithPlaybackError.filter(
			(t) =>
				!filter ||
				filter === `error:${t.playback_error}` ||
				filter === `youtube:${verdicts.get(t.media_id ?? '') ?? 'checking'}`
		)
	)
	// Follow the selected track as background verdicts change the queue. When resolved, take
	// its successor (or the new last track), rather than jumping back to the beginning.
	let cursor = $state({id: '', index: 0})
	const track = $derived(
		queue.find((t) => t.id === cursor.id) ?? queue[Math.min(cursor.index, queue.length - 1)]
	)
	const currentPage = $derived(track ? queue.indexOf(track) + 1 : 0)
	$effect(() => {
		if (track && (cursor.id !== track.id || cursor.index !== currentPage - 1)) {
			cursor = {id: track.id, index: currentPage - 1}
		}
	})

	let fixed = $state(0)

	/** @typedef {'checking' | 'alive' | 'dead' | 'restricted' | 'unknown'} Status */
	/** @typedef {{title: string, author_name: string}} Oembed */

	/** Every flagged track is checked against oembed in the background, so the whole list can be
	 * filtered by what YouTube says before you reach a card. Media id → status. */
	/** @type {SvelteMap<string, Status>} */
	const verdicts = new SvelteMap()
	$effect(() => {
		for (const t of tracksWithPlaybackError) {
			const id = t.media_id ?? ''
			if (untrack(() => verdicts.has(id))) continue
			verdicts.set(id, 'checking')
			verify(id)
				.then((v) => verdicts.set(id, v.status))
				.catch(() => verdicts.set(id, 'unknown'))
		}
	})
	const verdictCounts = $derived(
		[...verdicts.values()].reduce((acc, s) => acc.set(s, (acc.get(s) ?? 0) + 1), new Map())
	)

	/** @type {Status} */
	const status = $derived(verdicts.get(track?.media_id ?? '') ?? 'checking')
	/** @type {Array<{id: string, title: string, viewCount: number, author?: string}>} */
	let candidates = $state([])
	/** @type {'loading' | 'done' | 'failed'} */
	let searchStatus = $state('loading')
	let simplified = $state(false)
	// Typing stays local until submit; the title toggle submits its preset immediately.
	let draftQuery = $state('')
	let submittedQuery = $state('')
	const simplifiedTitle = $derived(cleanTitle(track?.title ?? '').trim())
	// Switching queries on the same card must also invalidate pending results.
	let searchRequest = 0
	/** The owner wants candidates even though YouTube says the video is alive. */
	let replacing = $state(false)
	/** Candidate id whose thumbnail has been swapped for an embedded player. */
	let previewId = $state('')

	$effect(() => {
		const t = track
		const s = status
		searchRequest++
		simplified = false
		draftQuery = t?.title.trim() ?? ''
		submittedQuery = ''
		candidates = []
		searchStatus = 'loading'
		replacing = false
		previewId = ''
		if (t && (s === 'dead' || s === 'restricted')) findReplacements(t)
	})

	// Warm only the next card's search while the owner reviews this one.
	const nextTrack = $derived(queue[currentPage])
	$effect(() => {
		const t = nextTrack
		const s = verdicts.get(t?.media_id ?? '')
		if (canEdit && t && (s === 'dead' || s === 'restricted')) {
			search(t.title).catch(() => {
				// Best effort: opening the card retries and shows any search failure.
			})
		}
	})

	/**
	 * @param {import('$lib/types').Track} t
	 * @param {string} query
	 */
	async function findReplacements(t, query = t.title) {
		const request = ++searchRequest
		submittedQuery = query.trim()
		candidates = []
		searchStatus = 'loading'
		previewId = ''
		const results = await search(query).catch(() => null)
		if (t !== track || request !== searchRequest) return
		if (!results) {
			searchStatus = 'failed'
			return
		}
		candidates = results.slice(0, 5)
		// The search endpoint has no uploader; oembed does, and it's the same cached lookup as verify.
		for (const candidate of candidates) {
			verify(candidate.id)
				.then((result) => {
					if (t !== track || request !== searchRequest || !result.data) return
					candidate.author = result.data.author_name
				})
				.catch(() => {
					// Uploader names are optional; a failed lookup must not discard search results.
				})
		}
		searchStatus = 'done'
	}

	/** @param {Event} event */
	function handlePreviewError(event) {
		const player = event.currentTarget
		if (
			!(player instanceof HTMLElement) ||
			player.dataset.trackId !== track?.id ||
			!('error' in player) ||
			typeof player.error !== 'number' ||
			![2, 100, 101, 150].includes(player.error) ||
			replacing
		)
			return
		// oEmbed only proves metadata exists; actual playback can still be blocked.
		replace()
	}

	const showResults = $derived(status === 'dead' || status === 'restricted' || replacing)

	function replace() {
		replacing = true
		findReplacements(track)
	}

	// Both lookups are cached for a day so revisiting tracks doesn't refetch.
	const DAY = 24 * 60 * 60 * 1000

	/**
	 * @param {string | null | undefined} mediaId
	 * @returns {Promise<{status: Status, data: Oembed | null}>}
	 */
	function verify(mediaId) {
		return queryClient.fetchQuery(oembedQuery(mediaId ?? ''))
	}

	/** @param {string} mediaId */
	function oembedQuery(mediaId) {
		return {
			queryKey: ['youtube-oembed', mediaId],
			staleTime: DAY,
			/** @returns {Promise<{status: Status, data: Oembed | null}>} */
			queryFn: async () => {
				if (!mediaId) return {status: 'dead', data: null}
				const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${mediaId}&format=json`
				const res = await fetch(url)
				if (res.ok) return {status: 'alive', data: await res.json()}
				// 404 is gone, 400 is an id YouTube never had; 401/403 are private, blocked or region-locked.
				// Anything else (429, 5xx) is YouTube's problem, not the video's: throw so it isn't cached.
				if (res.status === 404 || res.status === 400) return {status: 'dead', data: null}
				if (res.status === 401 || res.status === 403) return {status: 'restricted', data: null}
				throw new Error(`oembed ${res.status}`)
			}
		}
	}

	/** @param {string} title */
	function search(title) {
		// Preserve version/remix details unless the owner explicitly tries the simplified title.
		const query = title.trim()
		if (!query) return Promise.resolve([])
		return queryClient.fetchQuery({
			queryKey: ['youtube-search', query],
			staleTime: DAY,
			queryFn: async () => {
				const res = await fetch(
					`https://api.radio4000.com/api/search-youtube?query=${encodeURIComponent(query)}`,
					{signal: AbortSignal.timeout(8000)}
				)
				if (!res.ok) throw new Error(`search ${res.status}`)
				return (await res.json()).videos ?? []
			}
		})
	}

	function clear() {
		if (!channel) return
		updateTrack(channel, track.id, {playback_error: null}).then(() => fixed++)
	}

	/** @param {string} id */
	function pick(id) {
		if (!channel) return
		// A different upload has a different length; the player refills duration when it's missing.
		updateTrack(channel, track.id, {
			url: `https://www.youtube.com/watch?v=${id}`,
			playback_error: null,
			duration: null
		}).then(() => fixed++)
	}

	/** @param {number} page */
	function navigate(page) {
		const next = queue[page - 1]
		if (next) cursor = {id: next.id, index: page - 1}
	}

	function remove() {
		if (!channel) return
		if (!confirm(`Delete "${track.title}"?`)) return
		deleteTrack(channel, track.id).then(() => fixed++)
	}
</script>

<Seo title="Doctor @{slug}" plain />

<article class="constrained doctor">
	<p>
		Doctor finds tracks in your radio that might be broken. Check each track and replace the video
		if needed. Only the URL changes.
	</p>
	{#if channelCtx.isLoading || !tracksQuery.isReady}
		<p>Loading…</p>
	{:else if !canEdit}
		<p>Only the channel owner can do this.</p>
	{:else}
		<ol class="pipeline">
			<li>
				<select bind:value={filter} onchange={() => (cursor = {id: '', index: 0})}>
					<option value="">All ({tracksWithPlaybackError.length})</option>
					<optgroup label="By error">
						{#each errorCounts as [err, count] (err)}
							<option value="error:{err}">{err} ({count})</option>
						{/each}
					</optgroup>
					<optgroup label="By what YouTube says">
						<option value="youtube:alive">Still there ({verdictCounts.get('alive') ?? 0})</option>
						<option value="youtube:dead">Gone ({verdictCounts.get('dead') ?? 0})</option>
						<option value="youtube:restricted"
							>Blocked ({verdictCounts.get('restricted') ?? 0})</option
						>
					</optgroup>
				</select>
			</li>

			{#if !track}
				<li>
					<p>
						{#if !tracksWithPlaybackError.length}No playback errors to review.{:else}No tracks match
							this selection.{/if}
						{#if fixed}You fixed {fixed} today.{/if}
					</p>
					<menu class="row">
						{#if filter}
							<button type="button" onclick={() => (filter = '')}>Show all</button>
						{/if}
					</menu>
				</li>
			{:else}
				<li>
					<Pagination
						{currentPage}
						pageSize={1}
						totalCount={queue.length}
						onPageChange={navigate}
					/>
				</li>
				<li>
					{@render originalTrack()}
				</li>

				{#if showResults}
					<li>
						<form
							class="row"
							onsubmit={(event) => {
								event.preventDefault()
								if (draftQuery.trim()) findReplacements(track, draftQuery)
							}}
						>
							{#if simplifiedTitle && simplifiedTitle !== track.title.trim()}
								<button
									type="button"
									class="toggle"
									title={simplified ? 'Use original title' : 'Use cleaned title'}
									onclick={() => {
										simplified = !simplified
										draftQuery = simplified ? simplifiedTitle : track.title.trim()
										findReplacements(track, draftQuery)
									}}
								>
									<span class:hidden={simplified} aria-hidden={simplified}>Original</span>
									<span class:hidden={!simplified} aria-hidden={!simplified}>Cleaned</span>
								</button>
							{/if}
							<input
								type="search"
								aria-label="Replacement search"
								bind:value={draftQuery}
								required
							/>
							<button
								type="submit"
								disabled={!draftQuery.trim()}
								aria-label="Search"
								title="Search"
							>
								<Icon icon="search" />
							</button>
						</form>
						{#if searchStatus === 'failed'}
							<p>
								Couldn't search YouTube.
								<button
									type="button"
									class="ghost"
									onclick={() => findReplacements(track, submittedQuery)}>Try again</button
								>
							</p>
						{:else if searchStatus === 'done' && !candidates.length}
							<p>No results. Try another search.</p>
						{:else}
							<ol class="list candidates">
								{#each candidates as candidate (candidate.id)}
									{@render replacementCandidate(candidate)}
								{/each}
								{#if searchStatus === 'loading'}
									<!-- Match the results' five-row grid to keep the actions below in place. -->
									{#each Array(5) as _, i (i)}
										<li class="skeleton" aria-hidden="true">
											<span class="thumb"></span>
											<span></span>
											<span class="action"></span>
										</li>
									{/each}
								{/if}
							</ol>
							{#if searchStatus === 'loading'}
								<p role="status" class="visually-hidden">Searching YouTube…</p>
							{/if}
						{/if}
					</li>
				{/if}

				{#if (status === 'alive' || status === 'unknown') && !replacing}
					<li>
						<menu class="row">
							<button type="button" onclick={replace}>Find another video</button>
						</menu>
					</li>
				{/if}
			{/if}
		</ol>
	{/if}
</article>

{#snippet originalTrack()}
	<!-- Repair UI stays local: previews below must not control the listening decks. -->
	<header class="box">
		{#if track.media_id && appState.show_track_artwork}
			<img src={trackImageUrl(track.media_id)} alt="" />
		{/if}
		<div>
			<h3><a href="/{track.slug}/tracks/{track.id}">{track.title}</a></h3>
			{#if track.description}
				<p><LinkEntities slug={track.slug} text={track.description} /></p>
			{/if}
		</div>
		<PopoverMenu btnClass="ghost" align="end">
			{#snippet trigger()}
				<Icon icon="options-horizontal" /><span class="visually-hidden">Track actions</span>
			{/snippet}
			<menu class="nav-vertical">
				<a href="/{track.slug}/tracks/{track.id}" role="menuitem">
					<Icon icon="circle-info" /> Go to track
				</a>
				<button type="button" role="menuitem" onclick={() => (appState.modal_track_edit = {track})}>
					<Icon icon="edit" /> Edit
				</button>
				<button type="button" role="menuitem" class="danger" onclick={remove}>
					<Icon icon="delete" /> Delete track
				</button>
			</menu>
		</PopoverMenu>
	</header>
	<ol class="list candidates">
		<li class="original">
			<span class="thumb">
				{#if status === 'alive'}
					{#key `${track.id}:${track.media_id}`}
						<youtube-video
							src="https://www.youtube.com/watch?v={track.media_id}"
							aria-label={track.title}
							data-track-id={track.id}
							controls
							playsinline
							onerror={handlePreviewError}
						></youtube-video>
					{/key}
				{:else if track.media_id}
					<img src={trackImageUrl(track.media_id)} alt="" />
				{/if}
			</span>
			<div>
				<p>
					<code>{track.playback_error}</code>
					{#if status === 'checking'}· asking YouTube…{:else if status === 'alive'}· still on
						YouTube. Does it play?{:else if status === 'dead'}· gone from YouTube.{:else if status === 'unknown'}·
						couldn't reach YouTube. Try the player, or come back later.{:else}· private,
						region-locked or not embeddable.{/if}
				</p>
			</div>
			{#if status === 'alive'}
				<button type="button" class="primary" onclick={clear}>It works</button>
			{:else}
				<span></span>
			{/if}
		</li>
	</ol>
{/snippet}

{#snippet replacementCandidate(candidate)}
	<li class:previewing={previewId === candidate.id}>
		{#if previewId === candidate.id}
			<iframe
				src="https://www.youtube.com/embed/{candidate.id}?autoplay=1"
				title={candidate.title}
				allow="autoplay; encrypted-media"
				allowfullscreen
			></iframe>
		{:else}
			<button type="button" class="thumb" onclick={() => (previewId = candidate.id)} title="Listen">
				<img src={trackImageUrl(candidate.id)} alt="" loading="lazy" />
				<Icon icon="play-fill" />
			</button>
		{/if}
		<div>
			<a
				href="https://www.youtube.com/watch?v={candidate.id}"
				target="_blank"
				rel="noreferrer"
				data-no-external-icon>{candidate.title}</a
			>
			<small
				>{candidate.author ? `${candidate.author} · ` : ''}{candidate.viewCount.toLocaleString()} views</small
			>
		</div>
		<button type="button" onclick={() => pick(candidate.id)}>Use this one</button>
	</li>
{/snippet}

<style>
	.doctor ol {
		margin: 0;
	}

	header {
		min-height: 4rem;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
	}
	header > img {
		width: 2.5rem;
		flex-shrink: 0;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: var(--media-radius);
	}
	header > div {
		flex: 1;
		min-width: 0;
	}
	header h3 {
		font-size: var(--font-4);
	}
	header h3 a {
		color: inherit;
		text-decoration: none;
	}
	header p {
		color: var(--gray-11);
	}
	header h3,
	header p {
		overflow-wrap: anywhere;
	}

	/* Both labels occupy the same cell so switching searches cannot resize or wrap the toolbar. */
	.toggle {
		display: grid;
	}
	.toggle span {
		grid-area: 1 / 1;
	}
	.toggle .hidden {
		visibility: hidden;
	}
	form.row {
		gap: var(--space-1);
	}
	form input {
		flex: 1;
		min-width: 8rem;
		width: 0;
	}

	/* The pipeline: a line down the left, one dot per station. */
	.pipeline {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 1.5rem;
		position: relative;
		margin-left: var(--space-2);
		padding-left: 1.5rem;
		border-left: 2px solid var(--gray-5);
	}
	.pipeline > li:first-child {
		padding-top: var(--space-3);
	}
	.pipeline > li {
		position: relative;
		display: grid;
		gap: var(--space-2);
	}
	.pipeline > li > * {
		grid-column: 1;
	}
	.pipeline > li > :first-child {
		grid-row: 1;
	}
	.pipeline > li::before {
		content: '';
		grid-area: 1 / 1;
		align-self: center;
		position: relative;
		left: calc(-1 * 1.5rem - 1px);
		transform: translateX(-50%);
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--gray-5);
		border: 2px solid var(--color-interface);
	}
	.pipeline > li:last-child::before {
		background: var(--accent-9);
	}
	.skeleton span {
		display: block;
		background: var(--gray-4);
		border-radius: var(--border-radius);
	}
	.skeleton .thumb {
		aspect-ratio: 16 / 9;
		cursor: default;
	}
	.skeleton > span:nth-child(2) {
		height: 1em;
		width: 80%;
	}
	.skeleton .action {
		width: 7rem;
		height: 2.25rem; /* Match the global button height, including on two-row mobile cards. */
	}
	iframe {
		width: 100%;
		aspect-ratio: 16 / 9;
		border: 0;
		border-radius: var(--border-radius);
	}
	/* Row one is always player-sized so the results below never move between cards.
	   One wrapper holds either the player or a grey slot, so the row's box is identical. */
	.original code {
		color: var(--color-error);
	}
	.original:hover {
		background: none;
	}
	.original .thumb {
		background: var(--gray-3);
		aspect-ratio: 16 / 9;
		border-radius: var(--border-radius);
		overflow: hidden;
		cursor: default;
	}
	.original youtube-video {
		display: block;
		width: 100%;
		height: 100%;
	}
	.original .thumb img {
		filter: grayscale(1);
		opacity: 0.6;
	}
	/* Row padding is for hover; pull it back at the edges so lists sit on the same gap as everything else. */
	.doctor .candidates {
		margin-block: calc(-1 * var(--space-1));
	}
	.candidates > li {
		display: grid;
		grid-template-columns: 7rem 1fr auto;
		gap: var(--space-2);
		align-items: center;
		padding: var(--space-1);
	}
	.candidates > li.previewing {
		grid-template-columns: minmax(0, 18rem) 1fr auto;
	}
	.candidates div {
		display: grid;
		min-width: 0;
	}
	.candidates div a,
	.candidates small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.thumb {
		position: relative;
		display: block;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}
	.thumb img {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: var(--border-radius);
	}
	.thumb :global(svg) {
		position: absolute;
		inset: 0;
		margin: auto;
		color: white;
		filter: drop-shadow(0 0 4px rgb(0 0 0 / 0.6));
	}
	@media (max-width: 640px) {
		.candidates > li.previewing {
			grid-template-columns: 1fr;
		}
		.candidates > li:not(.previewing) {
			grid-template-columns: 6rem 1fr;
		}
		.candidates > li:not(.previewing) > button:not(.thumb),
		.skeleton .action {
			grid-column: 2;
			justify-self: start;
		}
	}
	/* Half again the candidate thumbnail: enough to press play, not a wall. Last so it beats the mobile rule. */
	.candidates > li.original {
		grid-template-columns: 9rem 1fr auto;
	}
</style>
