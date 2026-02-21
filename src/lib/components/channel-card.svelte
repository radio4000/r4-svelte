<script>
	import {appState} from '$lib/app-state.svelte'
	import {relativeDateDetailed} from '$lib/dates'
	import * as m from '$lib/paraglide/messages'
	import {trimWithEllipsis} from '$lib/utils.ts'
	import {playChannel, togglePlayPause} from '$lib/api'
	import {joinBroadcast} from '$lib/broadcast.js'
	import {broadcastsCollection} from '$lib/tanstack/collections'
	import ChannelAvatar from './channel-avatar.svelte'
	import LinkEntities from './link-entities.svelte'
	import ButtonFollow from './button-follow.svelte'
	import PopoverMenu from './popover-menu.svelte'
	import Icon from './icon.svelte'

	/** @type {{channel: import('$lib/types').Channel, href?: string, children?: import('svelte').Snippet}}*/
	let {channel, href, children} = $props()

	const cardHref = $derived(href ?? `/${channel.slug}`)

	const isBroadcasting = $derived((broadcastsCollection.state.size, broadcastsCollection.state.has(channel.id)))

	const isPlaying = $derived(
		Object.values(appState.decks).some((d) => d.playlist_slug === channel.slug && d.is_playing)
	)

	/** @param {MouseEvent} e */
	function handleDblClick(e) {
		e.preventDefault()
		if (e.target instanceof Element && e.target.closest('a, button')) return
		playChannel(appState.active_deck_id, channel)
	}

	function share() {
		appState.modal_share = {channel}
	}

	let articleEl = $state()
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<article class:playing={isPlaying} ondblclick={handleDblClick} tabindex="0" bind:this={articleEl}>
	<figure>
		<ChannelAvatar id={channel.image} alt={channel.name} />
	</figure>
	<div class="body">
		<div class="info">
			<h3>
				<a href={cardHref} data-sveltekit-preload-data="false">
					{channel.name}
					{#if isBroadcasting}
						<span class="channel-badge">{m.status_live_short()}</span>
					{/if}
				</a>
			</h3>
			<small class="slug"><a href={cardHref} data-sveltekit-preload-data="false">@{channel.slug}</a></small>
			{#if channel.description}
				<p class="description">
					<LinkEntities slug={channel.slug} text={trimWithEllipsis(channel.description)} />
				</p>
			{/if}
			{#if children}
				{@render children()}
			{/if}
			<div class="meta">
				{#if channel.track_count}<small>(<a href="{cardHref}/tracks">{channel.track_count}</a>)</small>{/if}
				{#if channel.latest_track_at}<small>{relativeDateDetailed(channel.latest_track_at)}</small>{/if}
			</div>
		</div>
		<div class="actions">
			<ButtonFollow {channel} class="ghost" />
	<PopoverMenu btnClass="ghost" align="right" valign="top">
				{#snippet trigger()}
					<Icon icon="options-horizontal" size={16} />
				{/snippet}
				<menu>
					<button
						type="button"
						role="menuitem"
						onclick={() =>
							isPlaying ? togglePlayPause(appState.active_deck_id) : playChannel(appState.active_deck_id, channel)}
					>
						<Icon icon={isPlaying ? 'pause' : 'play-fill'} size={16} />
						{isPlaying ? 'Pause' : 'Play'}
					</button>
					{#if isBroadcasting}
						<button type="button" role="menuitem" onclick={() => joinBroadcast(appState.active_deck_id, channel.id)}>
							<Icon icon="signal" size={16} /> Join broadcast
						</button>
					{/if}
					<button type="button" role="menuitem" onclick={share}>
						<Icon icon="share" size={16} /> Share
					</button>
				</menu>
				<menu class="nav-vertical">
					<a class="btn" href={cardHref} role="menuitem"><Icon icon="circle-info" size={16} /> Visit channel</a>
				</menu>
			</PopoverMenu>
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
		transition:
			background 0.1s,
			border-color 0.1s;

		&:hover {
			background: var(--gray-2);
			border-color: var(--gray-5);
		}

		&:focus,
		&:focus-within {
			background: var(--gray-2);
			border-color: var(--accent-7);
			outline: none;
		}

		&.playing {
			background: var(--accent-3);
			border-color: var(--gray-5);
		}

		:global(.list) & {
			display: grid;
			grid-template-columns: 4rem 1fr auto;
			align-items: center;
			padding: 0.5rem;
			gap: 0 0.5rem;
		}
	}

	figure {
		border-radius: var(--border-radius);
		background: var(--gray-2);
		aspect-ratio: 1;
		width: 100%;
		min-height: 2rem;
		overflow: hidden;

		:global(.list) & {
			grid-column: 1;
		}
	}

	.body {
		display: flex;
		flex-direction: row;
		gap: 0.25rem;
		flex: 1;

		:global(.list) & {
			grid-column: 2 / -1;
			align-items: center;
		}
	}

	.info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
		flex: 1;
		padding: 0.25rem;
	}

	.actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		flex-shrink: 0;

		:global(.popover-menu) {
			margin-top: auto;
		}
	}

	.meta {
		display: flex;
		justify-content: space-between;
		gap: 0.25rem;
		color: light-dark(var(--gray-10), var(--gray-9));
		font-size: var(--font-3);
		margin-top: auto;

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
		}
	}

	.slug {
		font-size: var(--font-3);
		color: light-dark(var(--gray-10), var(--gray-9));
		a {
			text-decoration: none;
			color: inherit;
			&:hover {
				text-decoration: underline;
			}
		}
	}

	h3 a:hover {
		color: var(--accent-9);
	}

	.description {
		color: light-dark(var(--gray-11), var(--gray-10));
		overflow-wrap: break-word;
	}

	h3 :global(.channel-badge) {
		animation: live-pulse 2s ease-in-out infinite;
	}

	@keyframes live-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}
</style>
