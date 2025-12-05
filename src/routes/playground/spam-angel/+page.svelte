<script>
	import {getContext} from 'svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import {analyzeChannel} from './spam-detector.js'
	import {spamDecisionsCollection} from '../../tanstack/collections'

	const getChannels = getContext('channels')
	const allChannels = $derived(getChannels())

	// Trigger reactivity when decisions change
	let decisionVersion = $state(0)

	// Channels with 0 tracks AND spam signals, sorted by confidence (highest first)
	const candidates = $derived.by(() => {
		void decisionVersion // trigger reactivity
		return allChannels
			.filter((ch) => (ch.track_count ?? 0) === 0)
			.map((ch) => ({
				...ch,
				analysis: analyzeChannel(ch),
				decision: spamDecisionsCollection.get(ch.id)?.spam
			}))
			.filter((ch) => ch.analysis.confidence > 0)
			.sort((a, b) => b.analysis.confidence - a.analysis.confidence)
	})

	let expanded = $state(new Set())

	function setDecision(id, spam) {
		const existing = spamDecisionsCollection.get(id)
		if (existing) {
			spamDecisionsCollection.update(id, (draft) => {
				draft.spam = spam
			})
		} else {
			spamDecisionsCollection.insert({channelId: id, spam})
		}
		decisionVersion++
	}

	function undoDecision(id) {
		spamDecisionsCollection.delete(id)
		decisionVersion++
	}

	function clearAll() {
		if (!confirm('Clear all decisions?')) return
		for (const id of spamDecisionsCollection.state.keys()) {
			spamDecisionsCollection.delete(id)
		}
		decisionVersion++
	}

	function toggleExpand(id) {
		if (expanded.has(id)) {
			expanded.delete(id)
		} else {
			expanded.add(id)
		}
		expanded = expanded // trigger reactivity
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
		<h1>Spam Angel</h1>
		<p>
			<strong>{undecided.length}</strong> to review ·
			<strong>{toDelete.length}</strong> to delete ·
			<strong>{toKeep.length}</strong> kept
		</p>
		<menu>
			<button onclick={() => navigator.clipboard.writeText(sql)} disabled={toDelete.length === 0}>
				Copy SQL ({toDelete.length})
			</button>
			<button onclick={clearAll} disabled={toDelete.length === 0 && toKeep.length === 0}> Clear all </button>
		</menu>
	</header>

	<pre>{sql || '-- Mark channels for deletion'}</pre>

	<ul class="list">
		{#each undecided as channel (channel.id)}
			{@const ev = channel.analysis.evidence}
			{@const hasMusic = ev.musicTerms.length > 0}
			{@const isExpanded = expanded.has(channel.id)}
			<li>
				<div class="main-row">
					<button class="IconBtn" onclick={() => toggleExpand(channel.id)} title="Expand">
						<ChannelAvatar id={channel.image} alt={channel.name} size={40} />
					</button>

					<div class="info">
						<div class="title-row">
							<h3>{channel.name}</h3>
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

					<div class="actions">
						<button onclick={() => setDecision(channel.id, false)}>Keep</button>
						<button class="danger" onclick={() => setDecision(channel.id, true)}>Delete</button>
					</div>
				</div>

				{#if isExpanded || channel.description?.length > 100}
					<div class="expanded" class:collapsed={!isExpanded && channel.description?.length > 100}>
						<p class="desc" onclick={() => toggleExpand(channel.id)}>
							{isExpanded ? channel.description : channel.description?.slice(0, 150)}
							{#if !isExpanded && channel.description?.length > 150}…{/if}
						</p>
					</div>
				{/if}
			</li>
		{/each}
	</ul>

	{#if toDelete.length > 0}
		<details>
			<summary>Marked for deletion ({toDelete.length})</summary>
			<ul class="list">
				{#each toDelete as channel (channel.id)}
					<li>
						{channel.name} <span class="meta">@{channel.slug}</span>
						<button onclick={() => undoDecision(channel.id)}>Undo</button>
					</li>
				{/each}
			</ul>
		</details>
	{/if}

	{#if toKeep.length > 0}
		<details>
			<summary>Marked to keep ({toKeep.length})</summary>
			<ul class="list">
				{#each toKeep as channel (channel.id)}
					<li>
						{channel.name} <span class="meta">@{channel.slug}</span>
						<button onclick={() => undoDecision(channel.id)}>Undo</button>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</main>

<style>
	h3 {
		margin: 0;
		font-weight: normal;
	}
	.main-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
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
		background: var(--color-red);
		color: white;
	}
	.tag[data-type='location'] {
		background: var(--orange-3);
	}
	.tag[data-type='music'] {
		background: var(--green-3);
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
	pre {
		height: 3em;
		overflow: auto;
	}
</style>
