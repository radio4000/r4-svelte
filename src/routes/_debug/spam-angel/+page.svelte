<script>
	import {getChannelsCtx} from '$lib/contexts'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import {analyzeChannel} from './spam-detector.js'
	import {spamDecisionsCollection} from '$lib/tanstack/collections'
	import {useLiveQuery} from '@tanstack/svelte-db'

	const getChannels = getChannelsCtx()
	const allChannels = $derived(getChannels())

	const decisionsQuery = useLiveQuery((q) => q.from({d: spamDecisionsCollection}))
	const decisions = $derived(decisionsQuery.data ?? [])

	// Channels with 0 tracks AND spam signals, sorted by confidence (highest first)
	const candidates = $derived(
		allChannels
			.filter((ch) => (ch.track_count ?? 0) === 0)
			.map((ch) => {
				const decision = decisions.find((d) => d.channelId === ch.id)
				return {
					...ch,
					analysis: analyzeChannel(ch),
					decision: decision?.spam
				}
			})
			.filter((ch) => ch.analysis.confidence > 0)
			.sort((a, b) => b.analysis.confidence - a.analysis.confidence)
	)

	let expanded = $state(new Set())

	function setDecision(channelId, spam) {
		if (spamDecisionsCollection.state.has(channelId)) {
			spamDecisionsCollection.delete(channelId)
		}
		spamDecisionsCollection.insert({channelId, spam})
	}

	function undoDecision(channelId) {
		spamDecisionsCollection.delete(channelId)
	}

	function clearAll() {
		if (!confirm('Clear all decisions?')) return
		for (const key of spamDecisionsCollection.state.keys()) {
			spamDecisionsCollection.delete(key)
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

	const undecided = $derived(candidates.filter((ch) => ch.decision === undefined))
	const toDelete = $derived(candidates.filter((ch) => ch.decision === true))
	const toKeep = $derived(candidates.filter((ch) => ch.decision === false))

	const sql = $derived(
		toDelete
			.map(
				(ch) =>
					`-- ${ch.name}\nDELETE FROM channel_track WHERE channel_id = '${ch.id}';\nDELETE FROM channels WHERE id = '${ch.id}';`
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

	function confidenceColor(confidence) {
		if (confidence >= 0.6) return 'var(--color-danger, #c00)'
		if (confidence >= 0.4) return 'var(--color-warning, #a50)'
		return 'var(--color-muted, #666)'
	}
</script>

<main>
	<header>
		<menu class="nav-grouped">
			<a href="/_debug">&larr;</a>
		</menu>
		<div>
			<h1>Spam Angel</h1>
			<p>Triage suspected spam channels for deletion.</p>
		</div>
		<menu>
			<button onclick={clearAll} disabled={toDelete.length === 0 && toKeep.length === 0}>Clear all</button>
		</menu>
	</header>

	<div class="triage">
		<!-- For Review (top, full width) -->
		<section class="column" data-column="review">
			<details open>
				<summary>For Review ({undecided.length})</summary>
				<ul class="list">
					{#each undecided as channel (channel.id)}
						{@const ev = channel.analysis.evidence}
						{@const hasMusic = ev.musicTerms.length > 0}
						{@const isExpanded = expanded.has(channel.id)}
						<li>
							<div class="main-row">
								<a href="/{channel.slug}" class="avatar-link">
									<ChannelAvatar id={channel.image} alt={channel.name} size={40} />
								</a>

								<div class="info">
									<div class="title-row">
										<h3><a href="/{channel.slug}">{channel.name}</a></h3>
										<span class="meta">{channel.slug} · {formatDate(channel.created_at)}</span>
									</div>

									<div class="evidence">
										{#if ev.keywords.length > 0}
											<span class="tag" data-type="spam"
												>{ev.keywords.slice(0, 4).join(', ')}{ev.keywords.length > 4 ? '…' : ''}</span
											>
										{/if}
										{#if ev.phrases.length > 0}
											<span class="tag" data-type="spam">"{ev.phrases[0]}"</span>
										{/if}
										{#if ev.locations.length > 0}
											<span class="tag" data-type="location">{ev.locations.join(', ')}</span>
										{/if}
										{#if hasMusic}
											<span class="tag" data-type="music">{ev.musicTerms.join(', ')}</span>
										{/if}
									</div>
								</div>

								<span class="score" style="color: {confidenceColor(channel.analysis.confidence)}">
									{Math.round(channel.analysis.confidence * 100)}%
								</span>

								<menu class="actions">
									<button class="danger" onclick={() => setDecision(channel.id, true)}>Delete</button>
									<button onclick={() => setDecision(channel.id, false)}>Keep</button>
								</menu>
							</div>

							{#if isExpanded || (channel.description?.length ?? 0) > 100}
								<div class="expanded" class:collapsed={!isExpanded && (channel.description?.length ?? 0) > 100}>
									<p class="desc" onclick={() => toggleExpand(channel.id)}>
										{isExpanded ? channel.description : channel.description?.slice(0, 150)}
										{#if !isExpanded && (channel.description?.length ?? 0) > 150}…{/if}
									</p>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</details>
		</section>

		<!-- Decisions row (bottom, 50/50) -->
		<section class="column" data-column="delete">
			<details open>
				<summary>
					<span>To Delete ({toDelete.length})</span>
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
</main>

<style>
	main {
		margin: 0.5rem;
	}
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
		justify-content: space-between;
		gap: 0.5rem;
		font-weight: 600;
		cursor: pointer;
		padding: 0.5rem;
		background: var(--gray-2);
		border-radius: var(--border-radius);
	}

	.column summary button {
		font-size: var(--font-4);
	}

	.column[data-column='delete'] summary::before {
		content: '×';
	}
	.column[data-column='keep'] summary::before {
		content: '✓';
	}

	.column .list {
		max-height: 70vh;
		overflow-y: auto;
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

	/* Review column card styles */
	h3 {
		margin: 0;
		font-weight: normal;
	}
	h3 a {
		color: inherit;
		text-decoration: none;
	}
	h3 a:hover {
		text-decoration: underline;
	}
	.avatar-link {
		flex-shrink: 0;
	}
	.main-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}
	.main-row :global(.placeholder) {
		min-width: 40px;
	}
	.info {
		flex: 1;
		min-width: 0;
	}
	.title-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.meta {
		font-size: var(--font-4);
		opacity: 0.5;
	}
	.evidence {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.25rem;
	}
	.tag {
		font-size: var(--font-4);
		padding: 0.1em 0.4em;
		border-radius: var(--border-radius);
	}
	.tag[data-type='spam'] {
		background: light-dark(hsl(0 70% 90%), hsl(0 40% 25%));
	}
	.tag[data-type='location'] {
		background: light-dark(hsl(30 70% 90%), hsl(30 40% 25%));
	}
	.tag[data-type='music'] {
		background: light-dark(hsl(120 50% 90%), hsl(120 30% 25%));
	}
	.score {
		min-width: 2.5rem;
		text-align: right;
		font-weight: bold;
	}
	.actions {
		display: flex;
		gap: 0.25rem;
	}
	.expanded {
		margin-top: 0.5rem;
		margin-left: 48px;
	}
	.expanded.collapsed {
		cursor: pointer;
	}
	.desc {
		margin: 0;
		opacity: 0.8;
		white-space: pre-wrap;
		word-break: break-word;
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
