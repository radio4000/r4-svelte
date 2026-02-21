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
	{#if isBroadcasting}<div class="live-dot"></div>{/if}
	<figure>
		<ChannelAvatar id={channel.image} alt={channel.name} />
	</figure>
	<div class="info">
		<h3>
			<a href={cardHref} data-sveltekit-preload-data="false">
				{channel.name}
				{#if isBroadcasting}
					<span class="channel-badge">{m.status_live_short()}</span>
				{/if}
			</a>
			<small><a href={cardHref} data-sveltekit-preload-data="false">@{channel.slug}</a></small>
		</h3>
		{#if channel.description}
			<p class="description">
				<LinkEntities slug={channel.slug} text={trimWithEllipsis(channel.description)} />
				{#if channel.track_count}
					<small>({channel.track_count})</small>
				{/if}
				{#if channel.latest_track_at}
					<small>{relativeDateDetailed(channel.latest_track_at)}</small>
				{/if}
			</p>
		{/if}
		{#if children}
			{@render children()}
		{/if}
	</div>
	<PopoverMenu btnClass="ghost" align="right">
		{#snippet trigger()}
			<Icon icon="options-horizontal" size={16} />
		{/snippet}
		<menu>
			<button type="button" role="menuitem" onclick={() => isPlaying ? togglePlayPause(appState.active_deck_id) : playChannel(appState.active_deck_id, channel)}>
				<Icon icon={isPlaying ? 'pause' : 'play-fill'} size={16} /> {isPlaying ? 'Pause' : 'Play'}
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
			<ButtonFollow {channel} />
		</menu>
	</PopoverMenu>
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
		transition:
			background 0.1s,
			border-color 0.1s;

		&:hover {
			background: var(--gray-2);
			border-color: var(--gray-5);
		}

		&:focus,
		&:focus-within {
			background: var(--accent-2);
			border-color: var(--accent-7);
			outline: none;
		}

		&.playing {
			background: var(--accent-3);
			border-color: var(--accent-9);
		}

		& > :global(.popover-menu) {
			align-self: flex-end;
			margin-top: auto;
		}

		:global(.list) & {
			display: grid;
			grid-template-columns: 4rem 1fr auto;
			align-items: start;
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
			grid-row: 1 / 3;
		}
	}

	.info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;

		:global(.list) & {
			grid-column: 2;
		}
	}

	h3 {
		font-weight: 600;
		font-size: var(--font-6);
		line-height: 1.2;
	}

	h3 a {
		text-decoration: none;
	}

	h3 small {
		font-size: var(--font-4);
		font-weight: 400;
	}

	h3 a:hover {
		color: var(--accent-9);
	}

	.description {
		color: light-dark(var(--gray-11), var(--gray-10));
		overflow-wrap: break-word;
		line-height: 1.2;
	}

	.live-dot {
		position: absolute;
		top: -1px;
		left: 1px;
		z-index: 1;
		width: var(--font-3);
		height: var(--font-3);
		background-color: #00ff00;
		border: 2px solid white;
		border-radius: 50%;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1);
	}
</style>
