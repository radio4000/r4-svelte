<script>
	import ButtonFollow from './button-follow.svelte'
	import ButtonPlay from './button-play.svelte'
	import ChannelAvatar from './channel-avatar.svelte'

	/** @type {{channel: import('$lib/types').Channel, size?: number}}*/
	let {channel, size = 250} = $props()
</script>

<figure>
	<ButtonPlay {channel} class="play" />
	<ButtonFollow {channel} class="follow" />
	<ChannelAvatar id={channel.image} alt={channel.name} {size} />
</figure>

<style>
	figure {
		position: relative;
		/* container-type: inline-size; */
	}

	figure :global(button) {
		position: absolute;
		top: 0.2rem;
	}

	figure :global(.play) {
		left: 0.2rem;
	}

	figure :global(.follow) {
		right: 0.2rem;
	}

	figure:not(:hover) :global(button) {
		opacity: 0;
	}

	figure:hover :global(button) {
		opacity: 1;
	}

	@container (max-width: 100px) {
		figure :global(.follow) {
			display: none;
		}
	}
</style>
