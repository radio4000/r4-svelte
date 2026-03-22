<script>
	import Icon from '$lib/components/icon.svelte'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import Tag from '$lib/components/tag.svelte'
	import PresenceCount from '$lib/components/presence-count.svelte'
	import {deckTitle} from '$lib/deck'
	import {extractHashtags} from '$lib/utils'
	import * as m from '$lib/paraglide/messages'

	/** @typedef {import('$lib/types').Deck} Deck */
	/** @typedef {import('$lib/types').Channel} Channel */
	/** @typedef {import('$lib/types').Track} Track */

	/**
	 * @type {{
	 *  deck?: Deck
	 *  channel?: Channel
	 *  track?: Track
	 *  titleElement?: string
	 *  titleClass?: string
	 *  onAutoClick?: (() => void) | undefined
	 *  onBroadcastSyncClick?: (() => void) | undefined
	 *  presenceCount?: number
	 * }}
	 */
	let {
		deck,
		channel,
		track,
		titleElement = 'h3',
		titleClass = '',
		onAutoClick,
		onBroadcastSyncClick,
		presenceCount = 0
	} = $props()

	const derivedTitle = $derived(deckTitle(deck, channel?.name))
	const slug = $derived(deck?.playlist_slug)
	const slugHref = $derived(slug ? `/${slug}` : undefined)
	const isPlaying = $derived(Boolean(deck?.is_playing))
	const isBroadcasting = $derived(Boolean(deck?.broadcasting_channel_id))
	const showAutoButton = $derived(Boolean(deck?.auto_radio))
	const autoGhost = $derived(!!deck?.is_playing && !deck?.auto_radio_drifted)
	const isListening = $derived(Boolean(deck?.listening_to_channel_id))
	const listeningWhoSlug = $derived(isListening ? channel?.slug : undefined)
	const listeningWhoHref = $derived(listeningWhoSlug ? `/${listeningWhoSlug}` : undefined)
	const listeningWhomSlug = $derived(isListening ? track?.slug || deck?.playlist_slug : undefined)
	const listeningWhomHref = $derived(listeningWhomSlug ? `/${listeningWhomSlug}` : undefined)
	const broadcastSyncDrifted = $derived(Boolean(deck?.listening_drifted))
	const broadcastSyncTitle = $derived(
		broadcastSyncDrifted ? m.player_sync_broadcast() : m.player_broadcast_synced()
	)
	const autoTitle = $derived(deck?.auto_radio_drifted ? m.auto_radio_resync() : m.auto_radio_join())
	const derivedTags = $derived(
		extractHashtags(deck?.playlist_title ?? '').map((tag) => ({
			label: tag,
			href: slug ? `/${slug}/tracks?tags=${encodeURIComponent(tag.slice(1))}` : undefined
		}))
	)

	const hasDistinctWhom = $derived(
		Boolean(listeningWhomSlug && listeningWhomSlug !== listeningWhoSlug)
	)
	const titleClassNames = $derived(
		['title-row', titleClass, isPlaying ? 'active' : ''].filter(Boolean).join(' ')
	)
</script>

<div class="deck-channel-header">
	<svelte:element this={titleElement} class={titleClassNames}>
		{#if slugHref}
			<a href={slugHref} class="title-link">{derivedTitle}</a>
		{:else}
			<span class="title-link">{derivedTitle}</span>
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
		{#if listeningWhoSlug}
			<a class="slug-link" href={listeningWhoHref}>@{listeningWhoSlug}</a>
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
			{/if}
			{#if hasDistinctWhom}
				<a class="slug-link" href={listeningWhomHref}>@{listeningWhomSlug}</a>
			{/if}
		{:else if slug}
			<a class="slug-link" href={slugHref}>@{slug}</a>
		{/if}

		{#each derivedTags as tag (tag.label)}
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
