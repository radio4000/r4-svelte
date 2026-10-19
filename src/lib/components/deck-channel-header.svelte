<script>
	import {resolve} from '$app/paths'
	import Icon from '#lib/components/icon.svelte'
	import AutoRadioButton from '#lib/components/auto-radio-button.svelte'
	import Tag from '#lib/components/tag.svelte'
	import {deckTitle} from '#lib/deck.js'
	import {extractHashtags, HASH_PREFIX_REGEX} from '#lib/utils.js'
	import * as m from '#lib/paraglide/messages.js'

	/** @typedef {import('#lib/types.js').Deck} Deck */
	/** @typedef {import('#lib/types.js').Channel} Channel */
	/** @typedef {import('#lib/types.js').Track} Track */

	/**
	 * @type {{
	 *  deck?: Deck
	 *  channel?: Channel
	 *  track?: Track
	 *  titleElement?: string
	 *  titleClass?: string
	 *  titleHref?: string
	 *  isBroadcastingChannel?: boolean
	 *  onAutoClick?: (() => void) | undefined
	 *  onBroadcastSyncClick?: (() => void) | undefined
	 *  presenceCount?: number
	 *  showModeMeta?: boolean
	 * }}
	 */
	let {
		deck,
		channel,
		track,
		titleElement = 'h3',
		titleClass = '',
		titleHref,
		isBroadcastingChannel = false,
		onAutoClick,
		onBroadcastSyncClick,
		presenceCount = 0,
		showModeMeta = true
	} = $props()

	const derivedTitle = $derived(deckTitle(deck, channel?.name))
	const slug = $derived(deck?.playlist_slug)
	const isPlaying = $derived(Boolean(deck?.is_playing))
	const isBroadcasting = $derived(
		Boolean(deck?.broadcasting_channel_id && deck.broadcasting_channel_id === channel?.id)
	)
	const showAutoButton = $derived(Boolean(deck?.auto_radio))
	const isListening = $derived(Boolean(deck?.listening_to_channel_id))
	const listeningWhoSlug = $derived(isListening ? channel?.slug : undefined)
	const listeningWhomSlug = $derived(isListening ? track?.slug || deck?.playlist_slug : undefined)
	const broadcastSyncDrifted = $derived(Boolean(deck?.listening_drifted))
	const broadcastSyncTitle = $derived(
		broadcastSyncDrifted ? m.player_sync_broadcast() : m.player_broadcast_synced()
	)
	const slugHref = (s) => (s ? resolve('/[slug]', {slug: s}) : undefined)
	const resolvedSlugHref = $derived(slugHref(slug))
	const resolvedChannelSlugHref = $derived(slugHref(channel?.slug))
	const resolvedListeningWhomHref = $derived(slugHref(listeningWhomSlug))
	const derivedTags = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local dedupe, not reactive state
		const tags = new Set(
			extractHashtags(deck?.playlist_title ?? '').map((tag) =>
				tag.replace(HASH_PREFIX_REGEX, '').toLowerCase()
			)
		)
		for (const source of deck?.view?.sources ?? []) {
			for (const tag of source?.tags ?? []) tags.add(tag.toLowerCase())
		}
		return Array.from(tags, (value) => ({
			label: `#${value}`,
			href: slug
				? `${resolve('/[slug]/tracks', {slug})}?tags=${encodeURIComponent(value)}`
				: undefined
		}))
	})

	const hasDistinctWhom = $derived(
		Boolean(listeningWhomSlug && listeningWhomSlug !== listeningWhoSlug)
	)
	const resolvedTitleHref = $derived(titleHref ?? (slug ? `/${slug}` : undefined))
</script>

<div class="deck-channel-header">
	<svelte:element this={titleElement} class={['title-row', titleClass, {active: isPlaying}]}>
		{#if resolvedTitleHref}
			<a href={resolvedTitleHref} class="title-link">{derivedTitle}</a>
		{:else}
			<span class="title-link">{derivedTitle}</span>
		{/if}
	</svelte:element>

	<div class="meta-row">
		{#if listeningWhoSlug}
			<a class="slug-link" href={resolvedChannelSlugHref}>@{listeningWhoSlug}</a>
			{#if showModeMeta && onBroadcastSyncClick}
				<button
					type="button"
					class={[
						'channel-badge',
						'sync-icon',
						{synced: !broadcastSyncDrifted, drifted: broadcastSyncDrifted}
					]}
					title={broadcastSyncTitle}
					aria-label={broadcastSyncTitle}
					onclick={onBroadcastSyncClick}
				>
					<Icon icon="signal" size={14} />
				</button>
			{/if}
			{#if hasDistinctWhom}
				<a class="slug-link" href={resolvedListeningWhomHref}>@{listeningWhomSlug}</a>
			{/if}
		{:else if resolvedSlugHref || resolvedChannelSlugHref}
			<a class="slug-link" href={resolvedSlugHref ?? resolvedChannelSlugHref}>
				@{slug || channel?.slug}
			</a>
			{#if showModeMeta && (isBroadcasting || isBroadcastingChannel)}
				<Icon icon="signal" size={12} class="broadcasting-icon" />
			{/if}
		{/if}

		{#if showModeMeta}
			{#each derivedTags as tag (tag.label)}
				<Tag href={tag.href} value={tag.label} deckId={deck?.id}>{tag.label}</Tag>
			{/each}
		{/if}

		{#if showModeMeta && showAutoButton}
			<AutoRadioButton
				class="auto-btn"
				live
				drifted={!!deck?.auto_radio_drifted}
				size={14}
				count={presenceCount}
				onclick={onAutoClick}
			/>
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
		gap: var(--space-1);
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

	:global(.broadcasting-icon) {
		color: var(--accent-9);
		flex-shrink: 0;
	}

	.meta-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-1);
		min-width: 0;
		font-size: var(--font-2);
	}

	.sync-icon {
		margin-left: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 var(--space-1);
	}

	.sync-icon :global(svg) {
		display: block;
	}

	.auto-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding-inline: var(--space-1);
		min-height: 1.35rem;
		align-self: center;
	}
</style>
