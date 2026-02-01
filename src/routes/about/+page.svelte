<script>
	import * as m from '$lib/paraglide/messages'
</script>

<svelte:head>
	<title>{m.about_title()}</title>
</svelte:head>

<article class="constrained">
	<header>
		<figure>
			<img
				src="https://upload.wikimedia.org/wikipedia/commons/3/30/The_Burning_of_the_Library_at_Alexandria_in_391_AD.jpg"
				alt={m.about_figcaption_alt()}
				width="400"
			/>
			<figcaption>{m.about_figcaption_text()}</figcaption>
		</figure>
		<h1>{m.about_title()}</h1>
		<p>{m.about_tagline()}</p>
	</header>

	<section>
		<h2>{m.about_your_radio()}</h2>
		<p>
			{m.about_glorified_playlist()}<br />
			{m.about_search_filter()}<br />
			{m.about_browse()}
		</p>
		<p>{m.about_data_local()}</p>
	</section>

	<section>
		<p>{m.about_get_url()}</p>
		<ul>
			<li>{m.about_download_cli()}</li>
			<li>{m.about_query_sql()}</li>
			<li>{m.about_export()}</li>
			<li>{m.about_api()}</li>
		</ul>
	</section>

	<section>
		<h2>{m.about_technical()}</h2>
		<p>
			{m.about_experimental()}
		</p>
	</section>

	<footer>
		<p>
			<a href="/create-channel" class="btn primary">{m.channel_create_title()}</a>
			<a href="/" class="btn">{m.about_start_exploring()}</a>
		</p>
		<p>
			<a href="https://github.com/radio4000/r4-sync-tests" rel="noopener noreferrer">{m.about_source_code()}</a>
		</p>
	</footer>
</article>

<style>
	section {
		margin: 2rem 0;
	}

	ul {
		margin: 0.5rem 0;
		padding-left: 1.5rem;
	}

	footer {
		margin-top: 3rem;
		text-align: center;
		color: var(--color-text-secondary);
		display: flex;
		flex-flow: column;
		gap: 1rem;
	}

	footer a {
		color: var(--color-primary);
	}

	figure {
		margin: 2rem 0;
		text-align: center;
	}

	figure img {
		max-width: 100%;
		height: auto;
	}

	figcaption {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		margin-top: 0.5rem;
	}
</style>
