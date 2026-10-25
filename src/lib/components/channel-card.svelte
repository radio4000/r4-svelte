<script>
	import {appState} from '#lib/app-state.svelte.js'
	import {relativeDateDetailed} from '#lib/dates.js'
	import * as m from '#lib/paraglide/messages.js'
	import {trimWithEllipsis} from '#lib/utils.js'
	import {toggleChannelPlay, playChannelInNewDeck} from '#lib/api.js'
	import {findChannelDeck} from '#lib/deck.js'
	import {joinBroadcast} from '#lib/broadcast.js'
	import {broadcastsCollection} from '#lib/collections/broadcasts.js'
	import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
	import ChannelAvatar from './channel-avatar.svelte'
	import LinkEntities from './link-entities.svelte'
	import ButtonFollow from './button-follow.svelte'
	import PopoverMenu from './popover-menu.svelte'
	import Icon from './icon.svelte'

	/** @type {{channel: import('#lib/types.js').Channel, href?: string, updatedAtHref?: string, children?: import('svelte').Snippet}}*/
	let {channel, href, updatedAtHref, children} = $props()

	const cardHref = $derived(href ?? `/${channel.slug}`)

	const broadcasts = useLiveQuery(broadcastsCollection)
	const isBroadcasting = $derived(
		broadcasts.data?.some((b) => b.channel_id === channel.id) ?? false
	)

	// Resolve the deck holding this channel once, then drive both display and action
	// from it — so "pause" on the button always toggles the deck it's showing.
	const channelDeck = $derived(
		findChannelDeck(appState.decks, appState.active_deck_id, channel.slug)
	)
	const isPlaying = $derived(Boolean(channelDeck?.is_playing))

	let playLoading = $state(false)

	/** @param {MouseEvent} [event] */
	async function triggerPrimaryAction(event) {
		event?.preventDefault()
		if (isBroadcasting) {
			joinBroadcast(appState.active_deck_id, channel.id)
			return
		}
		if (playLoading) return
		playLoading = true
		try {
			await toggleChannelPlay(channel)
		} finally {
			playLoading = false
		}
	}

	/** @param {MouseEvent} e */
	function handleDblClick(e) {
		if (e.target instanceof Element && e.target.closest('a, button')) return
		triggerPrimaryAction(e)
	}

	function share() {
		appState.modal_share = {channel}
	}
</script>

<article
	class="card"
	class:playing={isPlaying}
	ondblclick={handleDblClick}
	role="group"
	aria-label={channel.name}
>
	<figure>
		<ChannelAvatar id={channel.image} alt={channel.name} />
		<button
			class:active={isPlaying}
			onclick={triggerPrimaryAction}
			title={isBroadcasting
				? m.channel_card_join_broadcast()
				: isPlaying
					? m.common_pause()
					: m.common_play()}
		>
			<Icon icon={isPlaying ? 'pause' : 'play-fill'} />
		</button>
	</figure>
	<div class="body">
		<div class="info">
			<h3>
				<a href={cardHref} data-sveltekit-preload-data="false">
					{channel.name}
				</a>
				{#if isBroadcasting}
					<span class="channel-badge">
						<Icon icon="signal" size={12} />
						{m.status_live_short()}
					</span>
				{/if}
			</h3>
			<small class="slug"
				><a href={cardHref} class="slug-link" data-sveltekit-preload-data="false">@{channel.slug}</a
				></small
			>
			{#if channel.description}
				<p class="description">
					<LinkEntities slug={channel.slug} text={trimWithEllipsis(channel.description)} />
				</p>
			{/if}
			{#if children}
				{@render children()}
			{/if}
		</div>
		<div class="card-footer">
			<div class="meta">
				{#if channel.track_count}<small
						>(<a href="{cardHref}/tracks">{channel.track_count}</a>)</small
					>{/if}
				{#if channel.latest_track_at}
					<small>
						{#if updatedAtHref}
							<a href={updatedAtHref}>{relativeDateDetailed(channel.latest_track_at)}</a>
						{:else}
							{relativeDateDetailed(channel.latest_track_at)}
						{/if}
					</small>
				{/if}
			</div>
			<div class="actions">
				<ButtonFollow {channel} class="ghost" />
				<PopoverMenu btnClass="ghost" align="right" valign="top">
					{#snippet trigger()}
						<Icon icon="options-horizontal" />
					{/snippet}
					<menu class="nav-vertical">
						<button type="button" role="menuitem" onclick={triggerPrimaryAction}>
							<Icon icon={isBroadcasting ? 'signal' : isPlaying ? 'pause' : 'play-fill'} />
							{isBroadcasting
								? m.channel_card_join_broadcast()
								: isPlaying
									? m.common_pause()
									: m.common_play()}
						</button>
						{#if isBroadcasting}
							<button
								type="button"
								role="menuitem"
								onclick={() => joinBroadcast(appState.active_deck_id, channel.id)}
							>
								<Icon icon="signal" />
								{m.channel_card_join_broadcast()}
							</button>
						{/if}
						<button type="button" role="menuitem" onclick={() => playChannelInNewDeck(channel)}>
							<Icon icon="sidebar-fill-right" />
							{m.track_card_play_in_deck()}
						</button>
						<button type="button" role="menuitem" onclick={share}>
							<Icon icon="share" />
							{m.channel_card_share()}
						</button>
						<a class="btn" href={cardHref} role="menuitem"
							><Icon icon="circle-info" /> {m.channel_card_visit()}</a
						>
					</menu>
				</PopoverMenu>
			</div>
		</div>
	</div>
</article>

<style>
	article {
		position: relative;
		display: flex;
		flex-flow: column nowrap;
		gap: var(--space-1);
		background: var(--color-interface-elevated);
		border: 1px solid var(--color-interface-border);
		border-radius: var(--border-radius);
		padding: 0;
		user-select: none;
		cursor: var(--interactive-cursor, pointer);
		transition:
			background 0.1s,
			border-color 0.1s;

		@media (hover: hover) and (pointer: fine) {
			&:hover {
				background: var(--gray-3);
				border-color: var(--color-control-border-hover);
				--tag-bg: var(--accent-4);
				--tag-bg-hover: var(--accent-5);
				--tag-bg-active: var(--accent-6);
				--tag-color: var(--accent-11);
			}
		}

		&:focus,
		&:focus-within {
			background: var(--gray-3);
			border-color: var(--accent-7);
			outline: none;
			--tag-bg: var(--accent-4);
			--tag-bg-hover: var(--accent-5);
			--tag-bg-active: var(--accent-6);
			--tag-color: var(--accent-11);
		}

		/* Same restraint as the active site menu item: flatten the card itself
		   — no border, no fill — and let the accent channel name be the only cue.
		   Still picks up the normal hover/focus feedback (below), since those
		   are about "you can interact with this," not "this is playing". */
		&.playing {
			background: transparent;
			border-color: transparent;
		}

		&.playing h3 a {
			color: var(--accent-9);
		}

		&.playing:focus,
		&.playing:focus-within {
			background: var(--gray-3);
			border-color: var(--color-control-border-hover);
		}

		@media (hover: hover) and (pointer: fine) {
			&.playing:hover {
				background: var(--gray-3);
				border-color: var(--color-control-border-hover);
			}
		}

		:global(.list) & {
			display: grid;
			grid-template-columns: 5rem 1fr auto;
			align-items: stretch;
			padding: 0.5rem;
			gap: 0 0.75rem;
			/* Rows now carry their own border — a little breathing room keeps
			   adjacent borders from reading as one merged line. */
			margin-bottom: 2px;
		}
	}

	figure {
		position: relative;
		/* Flush against the card's top/left/right edges (only .body is padded),
		   so round just the top corners to match the card's own radius. */
		border-radius: var(--border-radius) var(--border-radius) 0 0;
		background: var(--gray-2);
		aspect-ratio: 1;
		width: 100%;
		min-height: 2rem;
		overflow: hidden;

		:global(.list) & {
			grid-column: 1;
			align-self: center;
			border-radius: var(--border-radius);
		}

		:global(button) {
			position: absolute;
			inset: 0;
			display: grid;
			place-content: center;
			opacity: 0;
			transition: opacity 0.15s;
			background: oklch(0 0 0 / 0.3);
			color: white;
		}

		:global(img),
		:global(.fallback) {
			transition: transform var(--duration-2) var(--ease-out);
		}

		article:focus-within & {
			:global(button) {
				opacity: 1;
			}
		}

		@media (hover: hover) and (pointer: fine) {
			article:hover & {
				:global(button) {
					opacity: 1;
				}
			}
		}

		article.playing & {
			:global(button) {
				opacity: 1;
			}

			:global(img),
			:global(.fallback) {
				transform: scale(1.08);
			}
		}

		@media (pointer: coarse) {
			:global(button) {
				opacity: 0;
			}
		}
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		flex: 1;
		padding: 0 var(--space-1) var(--space-1);

		:global(.list) & {
			grid-column: 2 / -1;
			flex-direction: row;
			align-items: stretch;
			flex-wrap: wrap;
			padding: 0;
		}
	}

	.info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
		margin-top: 0.5rem;
	}

	.card-footer {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--space-1);

		:global(.list) & {
			flex-shrink: 0;
			flex-direction: column;
			justify-content: space-between;
		}
	}

	.actions {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--space-1);
		flex-shrink: 0;

		:global(.list) & {
			flex-direction: column;
			justify-content: space-between;
			align-items: flex-end;
			flex: 1;
		}
	}

	.meta {
		display: flex;
		justify-content: space-between;
		gap: var(--space-1);
		color: light-dark(var(--gray-10), var(--gray-9));
		font-size: var(--font-3);
		flex: 1;

		:global(.list) & {
			display: none;
		}

		a {
			text-decoration: none;
			color: inherit;
			@media (hover: hover) and (pointer: fine) {
				&:hover {
					text-decoration: underline;
				}
			}
		}

		article:focus-within & {
			a {
				text-decoration: underline;
			}
		}

		@media (hover: hover) and (pointer: fine) {
			article:hover & {
				a {
					text-decoration: underline;
				}
			}
		}
	}

	h3 {
		display: flex;
		align-items: flex-start;
		gap: var(--space-1);
		font-weight: 600;
		font-size: var(--font-6);
		line-height: 1.2;
		min-width: 0;
	}

	h3 a {
		flex: 1;
		min-width: 0;
		text-decoration: none;
		transition: color var(--duration-1) var(--ease-out);
		@media (hover: hover) and (pointer: fine) {
			&:hover {
				text-decoration: underline;
				color: var(--accent-9);
			}
		}
	}

	.slug-link {
		@media (hover: hover) and (pointer: fine) {
			&:hover {
				text-decoration: underline;
			}
		}
	}

	.description {
		color: light-dark(var(--gray-11), var(--gray-10));
		overflow-wrap: break-word;
		font-size: var(--font-3);
	}

	.actions :global(.channel-badge) {
		animation: live-pulse 2s ease-in-out infinite;
		margin-left: 0;
	}

	.info h3 :global(.channel-badge) {
		margin-left: auto;
		flex-shrink: 0;
	}

	@keyframes live-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	/* no radius inside lists */
	:global(.virtual-item) article,
	:global(.list) article {
		border-radius: 0;
	}
</style>
