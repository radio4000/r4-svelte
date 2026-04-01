<script>
	import {appState} from '$lib/app-state.svelte'
	import {relativeDateDetailed} from '$lib/dates'
	import * as m from '$lib/paraglide/messages'
	import {trimWithEllipsis} from '$lib/utils'
	import {playChannel, togglePlayPause} from '$lib/api'
	import {joinBroadcast} from '$lib/broadcast.js'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import ChannelAvatar from './channel-avatar.svelte'
	import LinkEntities from './link-entities.svelte'
	import ButtonFollow from './button-follow.svelte'
	import PopoverMenu from './popover-menu.svelte'
	import ButtonPlay from './button-play.svelte'
	import Icon from './icon.svelte'

	/** @type {{channel: import('$lib/types').Channel, href?: string, updatedAtHref?: string, children?: import('svelte').Snippet}}*/
	let {channel, href, updatedAtHref, children} = $props()

	const cardHref = $derived(href ?? `/${channel.slug}`)

	const isBroadcasting = $derived(
		(broadcastsCollection.state.size, broadcastsCollection.state.has(channel.id))
	)

	const isPlaying = $derived(
		Object.values(appState.decks).some(
			(d) =>
				(d.playlist_slug === channel.slug || d.listening_to_channel_id === channel.id) &&
				d.is_playing
		)
	)

	/** @param {MouseEvent} e */
	function handleDblClick(e) {
		e.preventDefault()
		if (e.target instanceof Element && e.target.closest('a, button')) return
		if (isBroadcasting) {
			joinBroadcast(appState.active_deck_id, channel.id)
		} else {
			playChannel(appState.active_deck_id, channel)
		}
	}

	function share() {
		appState.modal_share = {channel}
	}

	let articleEl = $state()
</script>

<article
	class="card"
	class:playing={isPlaying}
	ondblclick={handleDblClick}
	role="group"
	aria-label={channel.name}
	bind:this={articleEl}
>
	<figure>
		<ChannelAvatar id={channel.image} alt={channel.name} />
		<ButtonPlay {channel} {isBroadcasting} />
	</figure>
	<div class="body">
		<div class="info">
			<h3>
				<a href={cardHref} data-sveltekit-preload-data="false">
					{channel.name}
				</a>
				{#if isBroadcasting}
					<span class="channel-badge live-pill">
						<Icon icon="cell-signal" size={12} />
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
					<menu>
						<button
							type="button"
							role="menuitem"
							onclick={() =>
								isPlaying
									? togglePlayPause(appState.active_deck_id)
									: isBroadcasting
										? joinBroadcast(appState.active_deck_id, channel.id)
										: playChannel(appState.active_deck_id, channel)}
						>
							<Icon icon={isPlaying ? 'pause' : isBroadcasting ? 'signal' : 'play-fill'} />
							{isPlaying ? m.common_pause() : isBroadcasting ? m.channel_card_join_broadcast() : m.common_play()}
						</button>
						<button type="button" role="menuitem" onclick={share}>
							<Icon icon="share" />
							{m.channel_card_share()}
						</button>
					</menu>
					<menu class="nav-vertical">
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
		gap: 0.25rem;
		border: 1px solid transparent;
		border-radius: var(--border-radius);
		padding: 0.25rem;
		user-select: none;
		cursor: var(--interactive-cursor, pointer);
		transition:
			background 0.1s,
			border-color 0.1s;

		&:hover {
			background: var(--gray-2);
			border-color: var(--gray-5);
			--tag-bg: var(--accent-4);
			--tag-bg-hover: var(--accent-5);
			--tag-bg-active: var(--accent-6);
			--tag-color: var(--accent-11);
		}

		&:focus,
		&:focus-within {
			background: var(--gray-2);
			border-color: var(--accent-7);
			outline: none;
			--tag-bg: var(--accent-4);
			--tag-bg-hover: var(--accent-5);
			--tag-bg-active: var(--accent-6);
			--tag-color: var(--accent-11);
		}

		&.playing {
			background: var(--accent-3);
			border-color: var(--gray-5);
			--tag-bg: var(--accent-6);
			--tag-bg-hover: var(--accent-7);
			--tag-bg-active: var(--accent-8);
			--tag-color: var(--accent-12);
		}

		:global(.list) & {
			display: grid;
			grid-template-columns: 5rem 1fr auto;
			align-items: stretch;
			padding: 0.5rem;
			gap: 0 0.75rem;
		}
	}

	figure {
		position: relative;
		border-radius: var(--border-radius);
		background: var(--gray-2);
		aspect-ratio: 1;
		width: 100%;
		min-height: 2rem;
		overflow: hidden;

		:global(.list) & {
			grid-column: 1;
			align-self: center;
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

		article:hover &,
		article:focus-within & {
			:global(button) {
				opacity: 1;
			}
		}

		article.playing & :global(button) {
			opacity: 1;
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
		gap: 0.25rem;
		flex: 1;

		:global(.list) & {
			grid-column: 2 / -1;
			flex-direction: row;
			align-items: stretch;
			flex-wrap: wrap;
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
		gap: 0.2rem;

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
		gap: 0.2rem;
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
		gap: 0.2rem;
		color: light-dark(var(--gray-10), var(--gray-9));
		font-size: var(--font-3);
		flex: 1;

		:global(.list) & {
			display: none;
		}

		a {
			text-decoration: none;
			color: inherit;
			&:hover {
				text-decoration: underline;
			}
		}

		article:hover &,
		article:focus-within & {
			a {
				text-decoration: underline;
			}
		}
	}

	h3 {
		font-weight: 600;
		font-size: var(--font-6);
		line-height: 1.2;
	}

	h3 a {
		text-decoration: none;
		&:hover {
			text-decoration: underline;
			color: var(--accent-9);
		}
	}

	.slug-link {
		&:hover {
			text-decoration: underline;
		}
	}

	.description {
		color: light-dark(var(--gray-11), var(--gray-10));
		overflow-wrap: break-word;
	}

	.actions :global(.channel-badge) {
		animation: live-pulse 2s ease-in-out infinite;
		margin-left: 0;
	}

	.live-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
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
