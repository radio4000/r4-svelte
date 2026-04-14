<script>
	import {resolve} from '$app/paths'
	import {appName, appShortName} from '$lib/config'
	import {getFeaturedPool} from '$lib/collections/featured'
	import {featuredScore} from '$lib/utils'
	import CoverFlip from '$lib/components/cover-flip.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import * as m from '$lib/paraglide/messages'
	import BackLink from '$lib/components/back-link.svelte'

	const FEATURED_DAYS = 30

	let featuredChannels = $state(/** @type {import('$lib/types').Channel[]} */ ([]))
	let featuredLoaded = $state(false)

	$effect(() => {
		if (featuredLoaded) return
		featuredLoaded = true
		void (async () => {
			try {
				const pool = await getFeaturedPool(FEATURED_DAYS)
				featuredChannels = pool
					.toSorted((a, b) => featuredScore(b) - featuredScore(a))
					.slice(0, 12)
			} catch (e) {
				console.warn('[about] failed to load featured channels', e)
			}
		})()
	})
</script>

<svelte:head>
	<title>{m.about_title({appName})}</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/menu')} />
		<h1>{m.about_title({appName})}</h1>
	</header>
</article>

<figure>
	<img
		src="/images/illustrations/the-burning-of-the-library-alexandria-391-ad.webp"
		alt={m.about_alexandria_alt()}
		width="1836"
		height="1552"
	/>
	<figcaption>{m.about_alexandria_caption()}</figcaption>
</figure>

<article class="constrained">
	<p>{m.about_intro()}</p>
</article>

<figure>
	<img
		src="/images/illustrations/ruins-of-the-augustus-bridge-at-narni.jpg"
		alt={m.about_bridge_alt()}
	/>
	<figcaption>{m.about_bridge_caption()}</figcaption>
</figure>

<article class="constrained">
	<p>{m.about_context()}</p>
</article>

<figure>
	<img src="/images/illustrations/around-the-moon-bayard-neuville.jpg" alt={m.about_moon_alt()} />
	<figcaption>{m.about_moon_caption()}</figcaption>
</figure>

<article class="constrained">
	<p>{m.about_features_intro()}</p>
	<ul>
		<li>{m.about_feature_web()}</li>
		<li>{m.about_feature_export()}</li>
		<li>{m.about_feature_cli({appShortName})}</li>
		<li>{m.about_feature_api()}</li>
		<li>{m.about_feature_no_trackers()}</li>
	</ul>
</article>

<figure>
	<img src="/images/illustrations/une-caverne-pendant-la-nuit.jpg" alt={m.about_cave_alt()} />
	<figcaption>{m.about_cave_caption()}</figcaption>
</figure>

{#if featuredChannels.length}
	<section class="about-slideshow">
		<CoverFlip items={featuredChannels} orientation="horizontal" class="featured-flip">
			{#snippet item({item: channel, active})}
				<div class="flip-card" class:active>
					<ChannelCard {channel} />
				</div>
			{/snippet}
			{#snippet active({item: channel})}
				<p class="flip-label">
					<a href={resolve(`/${channel.slug}`)}>{channel.name}</a>
					{#if channel.description}
						<span class="flip-desc"
							>— {channel.description.length > 140
								? channel.description.slice(0, 140) + '…'
								: channel.description}</span
						>
					{/if}
				</p>
			{/snippet}
		</CoverFlip>
	</section>
{/if}

<article class="constrained about-actions">
	<footer>
		<p>
			<a href={resolve('/create-channel')} class="btn primary">{m.channel_create_title()}</a>
			<a href={resolve('/')} class="btn">{m.common_start_exploring()}</a>
			<a href={resolve('/community')} class="btn ghost">Community</a>
		</p>
	</footer>
</article>

<style>
	article {
		margin-inline: auto;
	}

	figure {
		margin-block-end: 2rem;
	}

	img {
		display: block;
		max-width: 100%;
		max-height: 80dvh;
		width: auto;
		height: auto;
		margin-inline: auto;
	}

	figcaption {
		font-size: var(--font-3);
		margin-top: 0.2rem;
		text-align: center;
	}

	p,
	ul {
		margin-block: 1rem;
	}

	ul {
		padding-left: 2rem;
	}

	.about-slideshow {
		margin-bottom: 1.5rem;
	}

	footer p {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.about-actions {
		position: sticky;
		bottom: 0;
		padding-bottom: 0.5rem;
		background: color-mix(in srgb, var(--color-interface) 92%, transparent);
	}

	:global(.featured-flip) {
		gap: 0.25rem;
		margin-bottom: 0;
	}

	.flip-card {
		width: 250px;

		:global(.body) {
			display: none;
		}
	}

	.flip-desc {
		color: var(--gray-10);
	}

	.flip-label {
		text-align: center;
		font-size: var(--font-4);
		padding: 0.5rem;
		min-height: 6rem;
	}
</style>
