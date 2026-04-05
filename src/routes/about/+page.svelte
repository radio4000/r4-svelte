<script>
	import {resolve} from '$app/paths'
	import {appName, appShortName} from '$lib/config'
	import * as m from '$lib/paraglide/messages'
	import BackLink from '$lib/components/back-link.svelte'
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

<article class="constrained">
	<footer>
		<p>
			<a href={resolve('/create-channel')} class="btn primary">{m.channel_create_title()}</a>
			<a href={resolve('/')} class="btn">{m.common_start_exploring()}</a>
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

	footer p {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
</style>
