<script>
	import {resolve} from '$app/paths'
	import BroadcastControls from '$lib/components/broadcast-controls.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	/** @type {{
	 *  channel: import('$lib/types').Channel,
	 *  deckId: number,
	 *  isPlaying: boolean,
	 *  isBroadcasting: boolean,
	 *  onPlayPause: () => void,
	 * }} */
	let {channel, deckId, isPlaying, isBroadcasting, onPlayPause} = $props()
</script>

<menu class={['nav-grouped my-channel', {playing: isPlaying, live: isBroadcasting}]}>
	{#if isBroadcasting}
		<span class="live-badge">{m.status_live_short()}</span>
	{/if}
	<BroadcastControls
		{deckId}
		channelId={channel.id}
		channelSlug={channel.slug}
		compact
		showPresence={false}
	/>
	<button
		class="play-btn"
		onclick={onPlayPause}
		title={isPlaying ? m.common_pause() : m.common_play()}
		aria-label={isPlaying ? m.common_pause() : m.common_play()}
	>
		<span class="avatar">
			<ChannelAvatar id={channel.image} alt={channel.name} />
		</span>
		<span class="play-icon">
			<Icon icon={isPlaying ? 'pause' : 'play-fill'} size={13} />
		</span>
	</button>
	<a class="slug-link" href={resolve('/[slug]', {slug: channel.slug})}>
		<small> @{channel.slug} </small>
	</a>
</menu>

<style>
	.my-channel {
		align-items: stretch;
		margin-block-end: 0;

		/*
		&.playing {
			border-color: var(--accent-7);
			background: var(--accent-2);
		}

		&.live {
			border-color: var(--accent-7);
		}
		 */
	}

	.live-badge {
		display: flex;
		align-items: center;
		padding-inline: 0.4rem;
		background: var(--accent-3);
		color: var(--gray-1);
		color: red;
		font-size: var(--font-1);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		animation: live-pulse 2s ease-in-out infinite;
		flex-shrink: 0;
		border-top-left-radius: var(--border-radius);
		border-bottom-left-radius: var(--border-radius);
	}

	/* BroadcastControls inner button */
	:global(.my-channel > div) {
		display: contents;
	}

	:global(.my-channel > div > button) {
		border-radius: 0;
		border: 0;
		.live & {
		}
	}

	.play-btn {
		border-radius: 0;
	}

	.playing .play-btn {
		/*
		border-right-color: var(--accent-7);
		 */
	}

	.avatar {
		width: 1.5rem;
		:global(img, svg) {
			object-fit: cover;
		}
	}

	.slug-link {
		@media (max-width: 480px) {
			display: none;
		}
	}

	@keyframes live-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.8;
		}
	}
</style>
