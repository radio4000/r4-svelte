<script>
	import {resolve} from '$app/paths'
	import {appName, appShortName} from '#lib/config.js'
	import {getFeaturedPool} from '#lib/collections/featured.js'
	import {featuredScore, trimWithEllipsis} from '#lib/utils.js'
	import CoverFlip from '#lib/components/cover-flip.svelte'
	import ChannelCard from '#lib/components/channel-card.svelte'
	import * as m from '#lib/paraglide/messages.js'
	import BackLink from '#lib/components/back-link.svelte'
	import Seo from '#lib/components/seo.svelte'

	const FEATURED_DAYS = 30

	let featuredChannels = $state(/** @type {import('#lib/types.js').Channel[]} */ ([]))
	let featuredLoaded = $state(false)

	$effect(() => {
		if (featuredLoaded) return
		featuredLoaded = true
		void (async () => {
			try {
				const pool = await getFeaturedPool(FEATURED_DAYS)
				featuredChannels = pool.toSorted((a, b) => featuredScore(b) - featuredScore(a)).slice(0, 12)
			} catch (e) {
				console.warn('[about] failed to load featured channels', e)
			}
		})()
	})
</script>

<Seo title={m.about_title({appName})} plain />

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

<figure>
	<img src="/images/illustrations/une-caverne-pendant-la-nuit.jpg" alt={m.about_cave_alt()} />
	<figcaption>{m.about_cave_caption()}</figcaption>
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
					<a href={resolve('/[slug]', {slug: channel.slug})}>{channel.name}</a>
					{#if channel.description}
						<span class="flip-desc">— {trimWithEllipsis(channel.description, 140)}</span>
					{/if}
				</p>
			{/snippet}
		</CoverFlip>
	</section>
{/if}

<footer class="about-actions">
	<menu class="about-actions-group constrained">
		<a href={resolve('/create-channel')} class="btn primary">{m.channel_create_title()}</a>
		<a href={resolve('/')} class="btn">{m.common_start_exploring()}</a>
		<a href={resolve('/menu/community')} class="btn ghost">{m.nav_community()}</a>
	</menu>
</footer>

<style>
	article {
		margin-inline: auto;
	}

	article.focused.constrained {
		position: sticky;
		top: 0;
		z-index: 20;
		background: var(--color-interface);
	}

	figure {
		margin-block-end: 1.25rem;
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
		margin-top: var(--space-1);
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
		width: 100%;
		max-width: 100%;
		margin: 0 0 0.9rem;
		padding-inline: 0;
		overflow-x: clip;
	}

	.about-actions {
		padding: 0.65rem 0.5rem var(--space-1);
		text-align: center;
		position: sticky;
		bottom: 0;
		background: var(--gray-1);
		border-top: 1px solid var(--color-interface-border);
		z-index: 2;
	}

	.about-actions-group {
		display: flex;
		justify-content: center;
		gap: var(--space-1);
		flex-wrap: wrap;
		width: 100%;
		margin: 0 auto;
		padding: 0;
	}

	:global(.featured-flip) {
		width: 100%;
		max-width: 100%;
		gap: var(--space-1);
		margin-bottom: 0;
		overflow-x: clip;
	}

	.flip-card {
		width: 250px;

		:global(.body) {
			display: none;
		}
	}

	.flip-desc {
		color: var(--gray-10);
		overflow-wrap: anywhere;
	}

	.flip-label {
		text-align: center;
		font-size: var(--font-4);
		padding: 0.5rem;
		min-height: 6rem;
		max-width: 100%;
		overflow-wrap: anywhere;
	}
</style>
