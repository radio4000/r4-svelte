<script>
	import {goto} from '$app/navigation'
	import {appState} from '$lib/app-state.svelte'
	import {relativeDateDetailed} from '$lib/dates'
	import * as m from '$lib/paraglide/messages'
	import {trimWithEllipsis} from '$lib/utils.ts'
	import {broadcastsCollection} from '$lib/tanstack/collections'
	import ChannelHero from './channel-hero.svelte'
	import LinkEntities from './link-entities.svelte'

	/** @type {{channel: import('$lib/types').Channel, href?: string, children?: import('svelte').Snippet}}*/
	let {channel, href, children} = $props()

	const cardHref = $derived(href ?? `/${channel.slug}`)

	const broadcasting = $derived(
		(broadcastsCollection.state.size, broadcastsCollection.state.has(channel.id)) ||
			Object.values(appState.decks).some((d) => d.listening_to_channel_id === channel.id)
	)

	/** @param {MouseEvent} event */
	function navigate(event) {
		if (event.target instanceof Element && event.target.closest('a, button')) return
		goto(cardHref)
	}

	/** @param {MouseEvent} event */
	async function doubleclick({currentTarget}) {
		if (currentTarget instanceof HTMLElement) {
			currentTarget.querySelector('button')?.click()
		}
	}
</script>

<article onclick={navigate} ondblclick={doubleclick}>
	{#if broadcasting}<div class="live-dot"></div>{/if}
	<ChannelHero {channel} />
	<div>
		<h3>
			<a href={cardHref} data-sveltekit-preload-data="false">
				{channel.name}
				{#if broadcasting}
					<span class="channel-badge">{m.status_live_short()}</span>
				{/if}
			</a>
		</h3>
		<p>
			<LinkEntities slug={channel.slug} text={trimWithEllipsis(channel.description)} />
			{#if channel.track_count}
				<small>({channel.track_count})</small>
			{/if}
			{#if channel.latest_track_at}
				<small>{relativeDateDetailed(channel.latest_track_at)}</small>
			{/if}
		</p>
		{#if children}
			{@render children()}
		{/if}
	</div>
</article>

<style>
	article {
		position: relative;
		display: flex;
		flex-flow: column nowrap;
		gap: 0.5rem;
		cursor: pointer;

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

	h3 a {
		text-decoration: none;
	}

	article:hover h3 a {
		color: var(--accent-9);
		text-decoration-line: underline;
		text-decoration-thickness: 0.1px;
		text-decoration-color: var(--gray-10);
		text-underline-offset: max(0.1em, 2px);
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

	h3 + p {
		color: light-dark(var(--gray-11), var(--gray-10));
		overflow-wrap: break-word;
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
