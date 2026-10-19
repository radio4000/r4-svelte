<script>
	import {onMount, untrack} from 'svelte'
	import {SvelteMap} from 'svelte/reactivity'
	import ChannelAvatar from '#lib/components/channel-avatar.svelte'
	import {analyzeChannel} from './spam-detector.js'
	import {sdk} from '@radio4000/sdk'
	import {spamDecisionsCollection} from '#lib/collections/spam-decisions.js'
	import {createQuery} from '@tanstack/svelte-query'
	import {normalizeTrackMedia} from '#lib/collections/tracks.js'

	const MAX_TRACK_COUNT = 10
	const MIN_CONFIDENCE = 0.5
	const TRACK_SLUG_BATCH_SIZE = 25

	function chunk(values, size) {
		const chunks = []
		for (let index = 0; index < values.length; index += size) {
			chunks.push(values.slice(index, index + size))
		}
		return chunks
	}

	async function fetchTracksForSlugs(slugs) {
		const tracks = /** @type {Array<import('#lib/types.js').Track>} */ ([])
		for (const slugBatch of chunk(slugs, TRACK_SLUG_BATCH_SIZE)) {
			const {data, error} = await sdk.supabase
				.from('channel_tracks')
				.select('*')
				.in('slug', slugBatch)
			if (error) throw error
			const trackRows = /** @type {Array<import('#lib/types.js').Track>} */ (data ?? [])
			tracks.push(...trackRows)
		}
		return tracks.map(normalizeTrackMedia)
	}

	const channelsQuery = createQuery(() => ({
		queryKey: ['spam-angel', 'channels', MAX_TRACK_COUNT],
		queryFn: async () => {
			const {data, error} = await sdk.supabase
				.from('channels_with_tracks')
				.select('*')
				.lt('track_count', MAX_TRACK_COUNT)
				.order('created_at', {ascending: false})
			if (error) throw error
			return data ?? []
		},
		staleTime: 5 * 60 * 1000
	}))

	const allChannels = $derived(channelsQuery.data ?? [])
	const loading = $derived(channelsQuery.isPending)
	const error = $derived(channelsQuery.error?.message ?? null)

	// Fetch tracks for every candidate channel, grouped by slug. Supabase encodes `.in()`
	// filters in the URL, so split slug batches to avoid URI-too-long/CORS-looking failures.
	// `channels_with_tracks` only has track_count — the actual rows come from `channel_tracks`.
	const slugs = $derived(allChannels.map((ch) => ch.slug).filter(Boolean))

	const tracksQuery = createQuery(() => ({
		queryKey: ['spam-angel', 'tracks', slugs],
		queryFn: async () => {
			if (!slugs.length) return []
			return fetchTracksForSlugs(slugs)
		},
		enabled: slugs.length > 0,
		staleTime: 5 * 60 * 1000
	}))

	const tracksBySlug = $derived.by(() => {
		/** @type {Record<string, Array<import('#lib/types.js').Track>>} */
		const map = {}
		for (const track of tracksQuery.data ?? []) {
			if (!track.slug) continue
			;(map[track.slug] ??= []).push(track)
		}
		return map
	})

	const decisionsByChannel = new SvelteMap(
		Array.from(spamDecisionsCollection.state.values(), (d) => [d.channelId, d.spam])
	)
	const pendingDecisionPersistence = new SvelteMap()
	let decisionPersistenceScheduled = false

	// Channels with strong spam signals, sorted by confidence (highest first). Decisions are kept
	// out of this derived value so pressing `s` does not rerun spam analysis for the whole queue.
	const analyzedCandidates = $derived(
		allChannels
			.map((ch) => {
				const tracks = (ch.slug && tracksBySlug[ch.slug]) || []
				return {
					...ch,
					tracks,
					analysis: analyzeChannel(ch, tracks)
				}
			})
			.filter((ch) => ch.analysis.confidence >= MIN_CONFIDENCE)
			.sort((a, b) => b.analysis.confidence - a.analysis.confidence)
	)

	let expanded = $state(new Set())
	let requestedFocusedIndex = $state(0)
	let lastActionChannelId = $state(null)

	function scheduleDecisionPersistence(channelId, spam) {
		pendingDecisionPersistence.set(channelId, spam)
		if (decisionPersistenceScheduled) return
		decisionPersistenceScheduled = true
		setTimeout(flushDecisionPersistence, 0)
	}

	function flushDecisionPersistence() {
		decisionPersistenceScheduled = false
		const entries = [...pendingDecisionPersistence]
		pendingDecisionPersistence.clear()
		for (const [channelId, spam] of entries) {
			if (spamDecisionsCollection.state.has(channelId)) {
				spamDecisionsCollection.delete(channelId)
			}
			if (spam !== undefined) {
				spamDecisionsCollection.insert({channelId, spam})
			}
		}
	}

	function removeFromQueue(queue, channelId) {
		const index = queue.findIndex((channel) => channel.id === channelId)
		if (index === -1) return undefined
		return queue.splice(index, 1)[0]
	}

	function restoreToReview(channel) {
		if (!channel) return
		const index = undecided.findIndex(
			(queuedChannel) => queuedChannel.analysis.confidence < channel.analysis.confidence
		)
		if (index === -1) {
			undecided.push(channel)
		} else {
			undecided.splice(index, 0, channel)
		}
	}

	function setDecision(channelId, spam) {
		if (!channelId) return
		const channel =
			removeFromQueue(undecided, channelId) ??
			removeFromQueue(toDelete, channelId) ??
			removeFromQueue(toKeep, channelId)

		decisionsByChannel.set(channelId, spam)
		if (channel) (spam ? toDelete : toKeep).push(channel)
		scheduleDecisionPersistence(channelId, spam)
		lastActionChannelId = channelId
	}

	function undoDecision(channelId) {
		if (!channelId) return
		const channel = removeFromQueue(toDelete, channelId) ?? removeFromQueue(toKeep, channelId)
		decisionsByChannel.delete(channelId)
		restoreToReview(channel)
		scheduleDecisionPersistence(channelId, undefined)
	}

	function undoLast() {
		if (!lastActionChannelId) return
		undoDecision(lastActionChannelId)
		lastActionChannelId = null
	}

	function isTypingTarget(target) {
		if (!target) return false
		return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
	}

	function handleKeydown(event) {
		if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return
		const handlesKey = ['j', 'k', 'ArrowDown', 'ArrowUp', 's', 'e', 'u'].includes(event.key)
		if (!handlesKey) return

		event.preventDefault()
		event.stopImmediatePropagation()

		if (event.key === 'j' || event.key === 'ArrowDown') {
			requestedFocusedIndex = Math.min(focusedIndex + 1, Math.max(undecided.length - 1, 0))
		} else if (event.key === 'k' || event.key === 'ArrowUp') {
			requestedFocusedIndex = Math.max(focusedIndex - 1, 0)
		} else if (event.key === 's') {
			const channel = undecided[focusedIndex]
			if (channel) setDecision(channel.id, true)
		} else if (event.key === 'e') {
			const channel = undecided[focusedIndex]
			if (channel) setDecision(channel.id, false)
		} else if (event.key === 'u') {
			undoLast()
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeydown, {capture: true})
		return () => window.removeEventListener('keydown', handleKeydown, {capture: true})
	})

	function clearAll() {
		if (!confirm('Clear all decisions?')) return
		const keys = new Set([...spamDecisionsCollection.state.keys(), ...decisionsByChannel.keys()])
		decisionsByChannel.clear()
		undecided = [...analyzedCandidates]
		toDelete = []
		toKeep = []
		requestedFocusedIndex = 0
		lastActionChannelId = null
		for (const key of keys) {
			scheduleDecisionPersistence(key, undefined)
		}
	}

	function toggleExpand(id) {
		if (expanded.has(id)) {
			expanded.delete(id)
		} else {
			expanded.add(id)
		}
		expanded = expanded
	}

	function decisionFor(channel) {
		return channel.id ? decisionsByChannel.get(channel.id) : undefined
	}

	let undecided = $state([])
	let toDelete = $state([])
	let toKeep = $state([])

	$effect(() => {
		const candidates = analyzedCandidates
		untrack(() => {
			undecided = candidates.filter((ch) => decisionFor(ch) === undefined)
			toDelete = candidates.filter((ch) => decisionFor(ch) === true)
			toKeep = candidates.filter((ch) => decisionFor(ch) === false)
		})
	})

	const focusedIndex = $derived(Math.min(requestedFocusedIndex, Math.max(undecided.length - 1, 0)))

	// Keep the focused card in view instead of letting the selection drift off-screen.
	let reviewList = $state(/** @type {HTMLUListElement | null} */ (null))
	$effect(() => {
		if (undecided.length) {
			reviewList?.children[focusedIndex]?.scrollIntoView({block: 'nearest'})
		}
	})

	function escapeSqlString(str) {
		return str.replace(/'/g, "''")
	}

	const sql = $derived(
		toDelete
			.map(
				(ch) =>
					`-- ${ch.name} (@${ch.slug})\nselect ban_user_by_channel_slug('${escapeSqlString(ch.slug)}');`
			)
			.join('\n\n')
	)

	function copySQL() {
		navigator.clipboard.writeText(sql)
	}

	function formatDate(dateStr) {
		if (!dateStr) return '?'
		const d = new Date(dateStr)
		const now = new Date()
		const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
		if (diffDays < 7) return `${diffDays}d ago`
		if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
		if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
		return d.getFullYear().toString()
	}

	function confidenceLevel(confidence) {
		if (confidence >= 0.7) return 'high'
		if (confidence >= 0.6) return 'medium'
		return 'low'
	}
</script>

<svelte:head>
	<title>Spam Angel | Radio4000 docs</title>
</svelte:head>

<header>
	<div>
		<h1>Spam Angel</h1>
		<p>
			Review and mark suspected spam channels. Nothing is deleted here — use the generated SQL to
			act.
		</p>
	</div>
	<menu>
		<button onclick={clearAll} disabled={toDelete.length === 0 && toKeep.length === 0}
			>Clear all</button
		>
	</menu>
</header>

{#if loading}
	<p>Loading channels…</p>
{:else if error}
	<p>Error: {error}</p>
{/if}

<div class="triage">
	<section class="column" data-column="review">
		<details open>
			<summary>For Review ({undecided.length})</summary>
			<p>j/k or ↓/↑ to move · s to mark spam · e to keep · u to undo · showing ≥50%</p>
			<ul class="list" bind:this={reviewList}>
				{#each undecided as channel, i (channel.id)}
					{@const ev = channel.analysis.evidence}
					{@const hasMusic = ev.musicTerms.length > 0}
					{@const isExpanded = expanded.has(channel.id)}
					<li
						data-focused={i === focusedIndex}
						data-confidence={confidenceLevel(channel.analysis.confidence)}
					>
						<article>
							<header>
								<figure>
									<a href="/{channel.slug}">
										<ChannelAvatar id={channel.image} alt={channel.name} size={40} />
									</a>
								</figure>
								<hgroup>
									<h3><a href="/{channel.slug}">{channel.name}</a></h3>
									<p>{channel.slug} · {formatDate(channel.created_at)}</p>
								</hgroup>
								<strong class="score" data-score
									>{Math.round(channel.analysis.confidence * 100)}%</strong
								>
								<menu>
									<button class="danger" onclick={() => setDecision(channel.id, true)}>Spam</button>
									<button onclick={() => setDecision(channel.id, false)}>Keep</button>
								</menu>
							</header>

							<ul aria-label="Spam signals">
								{#if ev.trackSignals.length > 0}
									<li data-signal="tracks">Tracks: {ev.trackSignals.slice(0, 3).join(', ')}</li>
								{/if}
								{#if ev.keywords.length > 0}
									<li data-signal="spam">
										Keywords: {ev.keywords.slice(0, 4).join(', ')}{ev.keywords.length > 4
											? '…'
											: ''}
									</li>
								{/if}
								{#if ev.phrases.length > 0}
									<li data-signal="spam">Phrase: “{ev.phrases[0]}”</li>
								{/if}
								{#if ev.locations.length > 0}
									<li data-signal="location">Location: {ev.locations.join(', ')}</li>
								{/if}
								{#if hasMusic}
									<li data-signal="music">Music: {ev.musicTerms.join(', ')}</li>
								{/if}
							</ul>

							{#if isExpanded || (channel.description?.length ?? 0) > 100 || channel.tracks.length > 0}
								<section>
									{#if channel.description}
										<p>
											{isExpanded ? channel.description : channel.description?.slice(0, 150)}
											{#if !isExpanded && (channel.description?.length ?? 0) > 150}…{/if}
										</p>
									{/if}
									{#if isExpanded && channel.tracks.length > 0}
										<ul>
											{#each channel.tracks as track (track.id)}
												<li>
													<a href={track.url} rel="nofollow ugc noopener" target="_blank">
														{track.title || track.url}
													</a>
												</li>
											{/each}
										</ul>
									{:else if !isExpanded && ((channel.description?.length ?? 0) > 150 || channel.tracks.length > 0)}
										<button onclick={() => toggleExpand(channel.id)}>Show details</button>
									{/if}
								</section>
							{/if}
						</article>
					</li>
				{/each}
			</ul>
		</details>
	</section>

	<!-- Decisions row (bottom, 50/50) -->
	<section class="column" data-column="delete">
		<details open>
			<summary>
				<span>Marked as spam ({toDelete.length})</span>
				<button onclick={copySQL} disabled={toDelete.length === 0}>Copy SQL</button>
			</summary>
			<ul class="list">
				{#each toDelete as channel (channel.id)}
					<li>
						<span class="item-name">{channel.name}</span>
						<span class="meta">@{channel.slug}</span>
						<button onclick={() => undoDecision(channel.id)}>Undo</button>
					</li>
				{/each}
			</ul>
		</details>
	</section>

	<section class="column" data-column="keep">
		<details open>
			<summary>To Keep ({toKeep.length})</summary>
			<ul class="list">
				{#each toKeep as channel (channel.id)}
					<li>
						<span class="item-name">{channel.name}</span>
						<span class="meta">@{channel.slug}</span>
						<button onclick={() => undoDecision(channel.id)}>Undo</button>
					</li>
				{/each}
			</ul>
		</details>
	</section>
</div>

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	header h1 {
		margin: 0;
	}

	/* Triage layout: review on top, decisions 50/50 below */
	.triage {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		align-items: start;
	}

	.column {
		min-width: 0;
	}

	.column[data-column='review'] {
		grid-column: 1 / -1;
	}

	.column summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		cursor: var(--interactive-cursor, pointer);
		padding: 0.5rem;
		background: var(--gray-2);
		border-radius: var(--border-radius);
		list-style: none;
	}
	.column summary::-webkit-details-marker {
		display: none;
	}

	/* Rotating caret so open/closed state is obvious */
	.column summary::before {
		content: '▸';
		display: inline-block;
		transition: rotate 0.15s ease;
		color: var(--gray-11);
	}
	.column details[open] > summary::before {
		rotate: 90deg;
	}

	/* Push trailing controls (counts, buttons) to the right */
	.column summary > :last-child {
		margin-inline-start: auto;
	}

	.column summary button {
		font-size: var(--font-4);
	}

	.column .list {
		max-height: 70vh;
		overflow-y: auto;
		/* Padding + scroll-padding so the selection ring on the first/last card isn't clipped */
		padding: var(--space-2);
		scroll-padding-block: var(--space-2);
	}

	/* Side column items (delete/keep) */
	.column[data-column='delete'] li,
	.column[data-column='keep'] li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.item-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Review cards: each is a self-contained card whose risk colour reads at a glance */
	.column[data-column='review'] .list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.column[data-column='review'] li[data-confidence] {
		border: 1px solid var(--gray-5);
		border-radius: var(--border-radius);
		padding: var(--space-2);
		background: var(--gray-1);
	}

	.column[data-column='review'] article {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.column[data-column='review'] article > header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
	}

	.column[data-column='review'] hgroup {
		flex: 1;
		min-width: 0;
		margin: 0;
	}
	.column[data-column='review'] hgroup h3 {
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.column[data-column='review'] hgroup p {
		margin: 0;
		color: var(--gray-11);
		font-size: var(--font-4);
	}

	.column[data-column='review'] figure {
		inline-size: 40px;
		block-size: 40px;
		margin: 0;
	}

	.column[data-column='review'] figure a {
		display: block;
		inline-size: 100%;
		block-size: 100%;
	}

	.column[data-column='review'] figure :global(img),
	.column[data-column='review'] figure :global(.fallback) {
		inline-size: 100%;
		block-size: 100%;
		object-fit: cover;
	}

	/* Score badge: the headline verdict, coloured by risk level */
	.column[data-column='review'] .score {
		flex: none;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		padding: 0.1em 0.5em;
		border-radius: var(--border-radius);
		background: var(--gray-4);
		color: var(--gray-12);
	}
	.column[data-column='review'] li[data-confidence='medium'] .score {
		background: var(--color-warning, orange);
		color: light-dark(hsl(40 90% 12%), hsl(40 90% 8%));
	}
	.column[data-column='review'] li[data-confidence='high'] .score {
		background: var(--color-red);
		color: #fff;
	}

	.column[data-column='review'] ul[aria-label='Spam signals'] {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		padding: 0;
		list-style: none;
		font-size: var(--font-4);
	}

	.column[data-column='review'] [data-signal] {
		padding-inline: 0.4em;
		border-radius: var(--border-radius);
	}

	.column[data-column='review'] [data-signal='spam'] {
		background: light-dark(hsl(0 70% 90%), hsl(0 40% 25%));
	}

	.column[data-column='review'] [data-signal='location'] {
		background: light-dark(hsl(30 70% 90%), hsl(30 40% 25%));
	}

	.column[data-column='review'] [data-signal='music'] {
		background: light-dark(hsl(120 50% 90%), hsl(120 30% 25%));
	}

	.column[data-column='review'] [data-signal='tracks'] {
		background: light-dark(hsl(260 60% 90%), hsl(260 35% 28%));
	}

	/* Description / tracks: most muted layer of the card */
	.column[data-column='review'] article > section {
		margin: 0;
		color: var(--gray-10);
		font-size: var(--font-4);
	}
	.column[data-column='review'] article > section :is(p, ul) {
		margin: 0;
	}

	/* Actions live in the fixed-height header so variable body content never shifts them */
	.column[data-column='review'] article > header > menu {
		display: flex;
		gap: var(--space-1);
		margin: 0;
	}

	.column[data-column='review'] li[data-focused='true'] {
		outline: 2px solid var(--accent-9);
		outline-offset: 2px;
	}

	/* Mobile: stack all vertically */
	@media (max-width: 640px) {
		.triage {
			grid-template-columns: 1fr;
		}
		.column[data-column='review'] {
			grid-column: 1;
		}
	}
</style>
