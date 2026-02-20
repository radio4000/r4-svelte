<script>
	import {appState} from '$lib/app-state.svelte'
	import {relativeDateDetailed} from '$lib/dates'
	import * as m from '$lib/paraglide/messages'
	import {trimWithEllipsis} from '$lib/utils.ts'
	import {broadcastsCollection} from '$lib/tanstack/collections'
	import ChannelHero from './channel-hero.svelte'
	import LinkEntities from './link-entities.svelte'

	/** @type {{channel: import('$lib/types').Channel, href?: string, children?: import('svelte').Snippet}}*/
	let {channel, href, children} = $props()

	const broadcasting = $derived(
		(broadcastsCollection.state.size, broadcastsCollection.state.has(channel.id)) ||
			Object.values(appState.decks).some((d) => d.listening_to_channel_id === channel.id)
	)

	/** @param {MouseEvent} event */
	async function doubleclick({currentTarget}) {
		if (currentTarget instanceof HTMLElement) {
			currentTarget.querySelector('button')?.click()
		}
	}
</script>

<article ondblclick={doubleclick}>
	{#if broadcasting}<div class="live-dot"></div>{/if}
	<a href={href ?? `/${channel.slug}`} data-sveltekit-preload-data="false">
		<ChannelHero {channel} />
		<div>
			<h3>
				{channel.name}
				{#if broadcasting}
					<span class="channel-badge">{m.status_live_short()}</span>
				{/if}
				{#if channel.latest_track_at}
					<small>{relativeDateDetailed(channel.latest_track_at)}</small>
				{/if}
			</h3>
		</div>
	</a>
	{#if channel.description}
		<p class="description">
			<LinkEntities slug={channel.slug} text={trimWithEllipsis(channel.description)} />
			{#if channel.track_count}
				<small>({channel.track_count})</small>
			{/if}
		</p>
	{/if}
	{#if children}
		{@render children()}
	{/if}
</article>

<style>
	article {
		position: relative;
	}

	article > a {
		display: flex;
		flex-flow: column nowrap;
		gap: 0.5rem;
		text-decoration: none;

		:global(.list) & {
			display: grid;
			grid-template-columns: 4rem auto;
			align-items: center;
			padding: 0.5rem;
		}

		:global(.grid) & {
			display: flex;
			flex-flow: column nowrap;
		}
	}

	h3 {
		font-weight: 600;
	}

	h3,
	p {
		line-height: 1.2;
	}

	article > a:hover h3 {
		color: var(--accent-9);
		text-decoration-line: underline;
		text-decoration-thickness: 0.1px;
		text-decoration-color: var(--gray-10);
		text-underline-offset: max(0.1em, 2px);
	}

	article > a:focus,
	article :global(button):focus {
		outline: 2px solid var(--accent-9);
		outline-offset: -2px;
	}

	article :global(figure) {
		max-width: 50vw;
		aspect-ratio: 1/1;
		background: var(--gray-2);
		width: 100%;
		border-radius: var(--border-radius);
		/* for channels with no image */
		min-height: 2rem;
	}

	.description {
		color: light-dark(var(--gray-11), var(--gray-10));
		overflow-wrap: break-word;

		:global(.list) & {
			padding-left: calc(4rem + 0.5rem);
		}
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
