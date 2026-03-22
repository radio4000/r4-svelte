<script>
	import Icon from '$lib/components/icon.svelte'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import Tag from '$lib/components/tag.svelte'
	import PresenceCount from '$lib/components/presence-count.svelte'
	import * as m from '$lib/paraglide/messages'

	/**
	 * @typedef {{label: string, href?: string}} HeaderTag
	 */

	/**
	 * @type {{
	 *  title?: string
	 *  titleHref?: string
	 *  titleElement?: string
	 *  titleClass?: string
	 *  isPlaying?: boolean
	 *  isBroadcasting?: boolean
	 *  slug?: string
	 *  slugHref?: string
	 *  tags?: HeaderTag[]
	 *  showAutoButton?: boolean
	 *  autoGhost?: boolean
	 *  autoTitle?: string
	 *  onAutoClick?: (() => void) | undefined
	 *  listeningWhoSlug?: string
	 *  listeningWhoHref?: string
	 *  listeningWhomSlug?: string
	 *  listeningWhomHref?: string
	 *  showBroadcastSync?: boolean
	 *  broadcastSyncDrifted?: boolean
	 *  broadcastSyncTitle?: string
	 *  onBroadcastSyncClick?: (() => void) | undefined
	 *  presenceCount?: number
	 * }}
	 */
	let {
		title,
		titleHref,
		titleElement = 'h3',
		titleClass = '',
		isPlaying = false,
		isBroadcasting = false,
		slug,
		slugHref,
		tags = [],
		showAutoButton = false,
		autoGhost = false,
		autoTitle = 'Auto radio',
		onAutoClick,
		listeningWhoSlug,
		listeningWhoHref,
		listeningWhomSlug,
		listeningWhomHref,
		showBroadcastSync = false,
		broadcastSyncDrifted = false,
		broadcastSyncTitle = 'Sync broadcast',
		onBroadcastSyncClick,
		presenceCount = 0
	} = $props()

	const hasListeningPair = $derived(Boolean(listeningWhoSlug))
	const hasDistinctWhom = $derived(
		Boolean(listeningWhomSlug && listeningWhomSlug !== listeningWhoSlug)
	)
	const titleClassNames = $derived(
		['title-row', titleClass, isPlaying ? 'active' : ''].filter(Boolean).join(' ')
	)
</script>

<div class="deck-channel-header">
	<svelte:element this={titleElement} class={titleClassNames}>
		{#if titleHref}
			<a href={titleHref} class="title-link">{title}</a>
		{:else}
			<span class="title-link">{title}</span>
		{/if}
		{#if isBroadcasting}
			<span
				class="channel-badge live-pill"
				title={m.status_broadcasting()}
				aria-label={m.status_broadcasting()}
			>
				<Icon icon="cell-signal" size={14} />
				{m.status_live_short()}
			</span>
		{/if}
	</svelte:element>

	<div class="meta-row">
		{#if hasListeningPair}
			{#if listeningWhoHref}
				<a class="slug-link" href={listeningWhoHref}>@{listeningWhoSlug}</a>
			{:else}
				<span class="slug-link">@{listeningWhoSlug}</span>
			{/if}
			{#if showBroadcastSync}
				{#if onBroadcastSyncClick}
					<button
						type="button"
						class="channel-badge sync-icon"
						class:synced={!broadcastSyncDrifted}
						class:drifted={broadcastSyncDrifted}
						title={broadcastSyncTitle}
						aria-label={broadcastSyncTitle}
						onclick={onBroadcastSyncClick}
					>
						<Icon icon="signal" size={14} />
					</button>
				{:else}
					<span
						class="channel-badge sync-icon"
						title={broadcastSyncTitle}
						aria-label={broadcastSyncTitle}
					>
						<Icon icon="signal" size={14} />
					</span>
				{/if}
			{/if}
			{#if hasDistinctWhom}
				{#if listeningWhomHref}
					<a class="slug-link" href={listeningWhomHref}>@{listeningWhomSlug}</a>
				{:else}
					<span class="slug-link">@{listeningWhomSlug}</span>
				{/if}
			{/if}
		{:else if slug}
			{#if slugHref}
				<a class="slug-link" href={slugHref}>@{slug}</a>
			{:else}
				<span class="slug-link">@{slug}</span>
			{/if}
		{/if}

		{#each tags as tag (tag.label)}
			{#if tag.href}
				<Tag href={tag.href} value={tag.label}>{tag.label}</Tag>
			{:else}
				<Tag value={tag.label}>{tag.label}</Tag>
			{/if}
		{/each}

		{#if showAutoButton}
			<AutoRadioButton
				className="auto-btn active"
				synced={autoGhost}
				title={autoTitle}
				ariaLabel={autoTitle}
				size={14}
				onclick={onAutoClick}
			/>
		{/if}
		{#if presenceCount > 0}
			<PresenceCount count={presenceCount} />
		{/if}
	</div>
</div>

<style>
	.deck-channel-header {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		min-width: 0;
		margin: 0;
	}

	.title-link {
		font: inherit;
		color: inherit;
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.live-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		flex-shrink: 0;
	}

	.meta-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.25rem;
		min-width: 0;
		font-size: var(--font-2);
	}

	.sync-icon {
		margin-left: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 0.3rem;
	}

	.sync-icon :global(svg) {
		display: block;
	}

	.auto-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding-inline: 0.35rem;
		min-height: 1.35rem;
		align-self: center;
	}
</style>
