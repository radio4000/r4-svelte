<script>
	import {resolve} from '$app/paths'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'

	/** @type {{channel?: import('$lib/types').Channel, href?: string | undefined, className?: string}} */
	let {channel, href, className = ''} = $props()

	let linkHref = $derived(
		href ?? (channel?.slug ? resolve('/[slug]', {slug: channel.slug}) : undefined)
	)
</script>

{#if channel}
	{#if linkHref}
		<a class={['channel-micro-card', className]} href={linkHref}>
			<span class="avatar">
				<ChannelAvatar id={channel.image} alt={channel.name} />
			</span>
			<span class="slug">@{channel.slug}</span>
		</a>
	{:else}
		<span class={['channel-micro-card', className]}>
			<span class="avatar">
				<ChannelAvatar id={channel.image} alt={channel.name} />
			</span>
			<span class="slug">@{channel.slug}</span>
		</span>
	{/if}
{/if}

<style>
	.channel-micro-card {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 1.6rem;
		padding: 0.15rem 0.35rem 0.15rem 0.15rem;
		border-radius: var(--border-radius);
		color: inherit;
		text-decoration: none;
		background: var(--gray-2);
		border: 1px solid var(--gray-5);
	}

	.avatar {
		width: 1.2rem;
		height: 1.2rem;
		flex-shrink: 0;

		:global(img, svg) {
			width: 100%;
			height: 100%;
			border-radius: calc(var(--border-radius) - 0.15rem);
			object-fit: cover;
		}
	}

	.slug {
		font-size: var(--font-2);
		white-space: nowrap;
	}
</style>
