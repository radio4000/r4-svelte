<script>
	import {resolve} from '$app/paths'
	import {channelsCollection} from '#lib/collections/channels.js'
	import ChannelAvatar from '#lib/components/channel-avatar.svelte'

	/** @type {{channel?: import('#lib/types.js').Channel, slug?: string | null, href?: string | undefined, class?: string}} */
	let {channel, slug: slugProp, href, class: className = ''} = $props()

	let effectiveSlug = $derived(channel?.slug ?? slugProp)
	// Most callers only have a slug, not a full Channel — opportunistically pull
	// the avatar from the already-synced local collection (no network call; just
	// whatever happens to be cached). ChannelAvatar renders a placeholder icon
	// when there's no image, so the slot never just disappears.
	let resolvedChannel = $derived(
		channel ??
			(effectiveSlug
				? [...channelsCollection.state.values()].find((c) => c.slug === effectiveSlug)
				: undefined)
	)
	let linkHref = $derived(
		href ?? (effectiveSlug ? resolve('/[slug]', {slug: effectiveSlug}) : undefined)
	)
</script>

{#if effectiveSlug}
	{#if linkHref}
		<a class={['channel-micro-card', className]} href={linkHref}>
			<span class="avatar">
				<ChannelAvatar id={resolvedChannel?.image} alt={resolvedChannel?.name ?? effectiveSlug} />
			</span>
			<span class="slug">@{effectiveSlug}</span>
		</a>
	{:else}
		<span class={['channel-micro-card', className]}>
			<span class="avatar">
				<ChannelAvatar id={resolvedChannel?.image} alt={resolvedChannel?.name ?? effectiveSlug} />
			</span>
			<span class="slug">@{effectiveSlug}</span>
		</span>
	{/if}
{/if}

<style>
	.channel-micro-card {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 1.6rem;
		padding: var(--space-1) var(--space-1) var(--space-1) var(--space-1);
		border-radius: var(--border-radius);
		color: inherit;
		text-decoration: none;
		background: var(--color-interface-elevated);
		border: 1px solid var(--color-interface-border);
		transition:
			background 0.15s,
			border-color 0.15s;
	}

	/* Own hover/focus affordance — it sits inside a track row that has its own
	   hover/selected treatment, so without this it just looks like part of the
	   row instead of its own clickable channel link. */
	a.channel-micro-card:hover,
	a.channel-micro-card:focus-visible {
		background: var(--gray-4);
		border-color: var(--color-control-border-hover);
	}

	a.channel-micro-card:focus-visible {
		outline: 2px solid var(--accent-9);
		outline-offset: 1px;
	}

	.avatar {
		width: var(--track-artwork-size);
		height: var(--track-artwork-size);
		flex-shrink: 0;

		:global(img, svg) {
			width: 100%;
			height: 100%;
			border-radius: calc(var(--border-radius) - 0.2rem);
			object-fit: cover;
		}
	}

	.slug {
		display: block;
		font-size: var(--font-2);
		max-width: 20vw;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
