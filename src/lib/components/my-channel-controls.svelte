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

<div class="my-channel" class:playing={isPlaying} class:live={isBroadcasting}>
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
	<a class="channel-link" href={resolve('/[slug]', {slug: channel.slug})}>
		<span class="slug">@{channel.slug}</span>
	</a>
</div>

<style>
	.my-channel {
		display: flex;
		align-items: stretch;
		border: 1px solid var(--gray-5);
		border-radius: var(--border-radius);
		overflow: hidden;
		transition: border-color 0.15s;

		&.playing {
			border-color: var(--accent-7);
			background: var(--accent-2);
		}

		&.live {
			border-color: var(--accent-7);
		}
	}

	.live-badge {
		display: flex;
		align-items: center;
		padding-inline: 0.4rem;
		border-right: 1px solid var(--accent-7);
		background: var(--accent-9);
		color: var(--gray-1);
		font-size: var(--font-1);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		animation: live-pulse 2s ease-in-out infinite;
		flex-shrink: 0;
	}

	/* BroadcastControls inner button */
	:global(.my-channel > div) {
		display: contents;
	}

	:global(.my-channel > div > button) {
		border-radius: 0;
		border-right: 1px solid var(--gray-5);

		.live & {
			border-right-color: var(--accent-7);
		}
	}

	.play-btn {
		display: flex;
		align-items: center;
		padding: 0.25rem 0.3rem;
		border-radius: 0;
		border-right: 1px solid var(--gray-5);
		gap: 0.2rem;

		.playing & {
			border-right-color: var(--accent-7);
		}
	}

	.avatar {
		width: 1.3rem;
		height: 1.3rem;
		flex-shrink: 0;
		border-radius: 2px;
		overflow: hidden;

		:global(img, svg) {
			width: 100%;
			height: 100%;
			object-fit: cover;
		}
	}

	.play-icon {
		display: flex;
		align-items: center;
		opacity: 0.7;
		flex-shrink: 0;
	}

	.channel-link {
		display: flex;
		align-items: center;
		padding: 0.25rem 0.5rem;
		text-decoration: none;
		color: inherit;
		font-size: var(--font-3);
		min-width: 0;

		&:hover .slug {
			text-decoration: underline;
		}
	}

	.slug {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;

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
			opacity: 0.5;
		}
	}
</style>
