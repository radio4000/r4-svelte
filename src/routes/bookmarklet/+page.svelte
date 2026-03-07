<script>
	let {data} = $props()
	const bookmarkletHref = `javascript:(function(){window.open('${data.origin}/add?url='+encodeURIComponent(location.href))})();`
</script>

<svelte:head>
	<title>Bookmarklet — Radio4000</title>
</svelte:head>

<article class="constrained">
	<h1>Bookmarklet — add a track in two clicks</h1>

	<p>
		A bookmarklet works like a bookmark. It sits in your browser's bookmarks bar. Instead of opening
		a page, it runs a script. This one takes the URL of whatever page you're on and opens
		Radio4000's add-track form with it pre-filled.
	</p>

	<p>Works on YouTube, SoundCloud, Discogs, and anywhere else you find music.</p>

	<div class="steps">
		<section>
			<h2>1. Drag this into your bookmarks bar</h2>
			<!-- svelte-ignore a11y_invalid_attribute -->
			<a class="btn primary bookmarklet" href={bookmarkletHref} data-sveltekit-reload>Add to Radio4000</a>
			<p class="tip">Or right-click and choose "Bookmark this link".</p>
		</section>

		<section>
			<h2>2. Visit a page with music and click the bookmarklet</h2>
			<p>
				Try it on a YouTube video, a SoundCloud track, or a Discogs release — the URL lands in the
				right field automatically.
			</p>
		</section>
	</div>
</article>

<style>
	article {
		margin-inline: auto;
	}

	h1 {
		margin-block: 1.5rem 1rem;
	}

	.steps {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
		margin-block-start: 2rem;
	}

	@media (max-width: 600px) {
		.steps {
			grid-template-columns: 1fr;
		}
	}

	.bookmarklet {
		margin-block: 0.75rem;
	}

	.tip {
		font-size: var(--font-3);
		color: var(--color-text-2);
	}
</style>
