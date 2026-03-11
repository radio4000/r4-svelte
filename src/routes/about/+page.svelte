<script>
	import {resolve} from '$app/paths'
	import * as m from '$lib/paraglide/messages'
	import BackLink from '$lib/components/back-link.svelte'
</script>

<svelte:head>
	<title>About Radio4000</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/settings')} />
		<h1>About Radio4000</h1>
	</header>
</article>

<figure>
	<img
		src="https://upload.wikimedia.org/wikipedia/commons/3/30/The_Burning_of_the_Library_at_Alexandria_in_391_AD.jpg"
		alt="The Burning of the Library at Alexandria in 391 AD"
		width="1836"
		height="1552"
	/>
	<figcaption>The Burning of the Library at Alexandria in 391 AD — Ambrose Dudley</figcaption>
</figure>

<article class="constrained">
	<p>
		Everyone gets one channel. When you like a track, add it. No playlists to organize, no folders to maintain — your
		personality gives soul to your radio. Discover songs in the context of someone whose taste you enjoy.
	</p>
</article>

<figure>
	<img
		src="/images/illustrations/ruins-of-the-augustus-bridge-at-narni.jpg"
		alt="Ruins of the Augustus Bridge at Narni"
	/>
	<figcaption>Ruins of the Augustus Bridge at Narni — Georg Abraham Hackert</figcaption>
</figure>

<article class="constrained">
	<p>
		A track is a pointer with your opinions — a URL, a title, your tags. The music lives out there. Your channel is the
		context.
	</p>
</article>

<figure>
	<img src="/images/illustrations/around-the-moon-bayard-neuville.jpg" alt="Around the Moon" />
	<figcaption>Around the Moon — Bayard & Neuville</figcaption>
</figure>

<article class="constrained">
	<p>
		Use #tags to filter however you want. Search your archive instantly. Save a search as a view. Browse other radios to
		discover what fellow humans are curating. Broadcast your deck live, or let auto-radio play for everyone at the same
		time — just the clock.
	</p>
	<ul>
		<li>No native apps, just the web</li>
		<li>Export tracks anytime — what is yours is yours</li>
		<li>Use the R4 CLI to mirror your radio offline</li>
		<li>Build on the open API to do whatever you need</li>
		<li>No trackers, no ads (except those from YouTube player)</li>
	</ul>
</article>

<figure>
	<img
		src="/images/illustrations/une-caverne-pendant-la-nuit.jpg"
		alt="Une caverne pendant la nuit à l'époque du grand ours et du mammouth"
	/>
	<figcaption>Une caverne pendant la nuit — Émile Bayard</figcaption>
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

	header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-block: 1rem;
	}

	h1 {
		margin: 0;
	}

	figure {
		max-height: 80dvh;
		overflow: hidden;
		margin-block-end: 2rem;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	img {
		max-width: 100%;
		height: auto;
	}

	figcaption {
		font-size: var(--font-3);
		margin-top: 0.2rem;
	}

	p,
	ul {
		margin-block: 1rem;
	}

	ul {
		padding-left: 2rem;
	}
</style>
