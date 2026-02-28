<script>
	import * as m from '$lib/paraglide/messages'
</script>

<svelte:head>
	<title>About Radio4000</title>
</svelte:head>

<article class="constrained">
	<header>
		<figure>
			<img
				src="https://upload.wikimedia.org/wikipedia/commons/3/30/The_Burning_of_the_Library_at_Alexandria_in_391_AD.jpg"
				alt="The Burning of the Library at Alexandria in 391 AD"
				width="1836"
				height="1552"
			/>
			<figcaption>The Burning of the Library at Alexandria in 391 AD — Ambrose Dudley</figcaption>
		</figure>
	</header>

	<section>
		<h1>About Radio4000, music explorer</h1>
		<p>
			Everyone gets one channel. When you like a track, add it. No playlists to organize, no folders to maintain — your
			personality gives soul to your radio. Discover songs in the context of someone whose taste you enjoy.
		</p>
		<p>
			A track is a pointer with your opinions — a URL, a title, your tags. The music lives out there. Your channel is
			the context.
		</p>
		<p>
			Use #tags to filter however you want. Search your archive instantly. Save a search as a view. Browse other radios
			to discover what fellow humans are curating. Broadcast your deck live, or let auto-radio play for everyone at the
			same time — just the clock.
		</p>
		<ul>
			<li>No native apps, just the web</li>
			<li>Export tracks anytime — what is yours is yours</li>
			<li>Use the R4 CLI to mirror your radio offline</li>
			<li>Build on the open API to do whatever you need</li>
			<li>It'd be cool if this was based on atproto but its not, yet</li>
			<li>No trackers, no ads (except those from YouTube player)</li>
		</ul>
		<p>Radio4000 was started back in 2014 and we're still online.</p>
	</section>

	<section>
		<figure>
			<img
				src="/images/illustrations/ruins-of-the-augustus-bridge-at-narni.jpg"
				alt="Ruins of the Augustus Bridge at Narni"
			/>
			<figcaption>Ruins of the Augustus Bridge at Narni — Georg Abraham Hackert</figcaption>
		</figure>
		<figure>
			<img src="/images/illustrations/around-the-moon-bayard-neuville.jpg" alt="Around the Moon" />
			<figcaption>Around the Moon — Bayard & Neuville</figcaption>
		</figure>
		<figure>
			<img
				src="/images/illustrations/une-caverne-pendant-la-nuit.jpg"
				alt="Une caverne pendant la nuit à l'époque du grand ours et du mammouth"
			/>
			<figcaption>Une caverne pendant la nuit — Émile Bayard</figcaption>
		</figure>
		<figure>
			<img src="/images/illustrations/more-otho-flying-richard-neuhauss.jpg" alt="More Otho Flying" />
			<figcaption>More Otho Flying — Richard Neuhauss</figcaption>
		</figure>
	</section>

	<footer>
		<p>
			<a href="/create-channel" class="btn primary">{m.channel_create_title()}</a>
			<a href="/" class="btn">{m.common_start_exploring()}</a>
		</p>
		<p>
			<a href="https://github.com/radio4000/r4-sync-tests" rel="noopener noreferrer">Source code on GitHub</a>
			·
			<a href="https://matrix.to/#/#radio4000:matrix.org" rel="noopener noreferrer">Chat on Matrix</a>
		</p>
	</footer>
</article>

<style>
	section {
		margin-inline: 1rem;
		ul,
		p {
			margin-block: 1rem;
		}
	}

	ul {
		padding-left: 2rem;
	}

	figure {
		margin-block-end: 2rem;
	}

	img {
		height: auto;
	}

	figcaption {
		font-size: var(--font-3);
		margin-top: 0.2rem;
	}

	footer {
		margin-top: 3rem;
		text-align: center;
		color: var(--color-text-secondary);
		display: flex;
		flex-flow: column;
		gap: 1rem;
	}
</style>
