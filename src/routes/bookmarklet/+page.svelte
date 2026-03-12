<script>
	import * as m from '$lib/paraglide/messages'

	let {data} = $props()
	const bookmarkletHref = `javascript:(function(){window.open('${data.origin}/add?url='+encodeURIComponent(location.href))})();`
</script>

<svelte:head>
	<title>{m.bookmarklet_title()}</title>
</svelte:head>

<article class="constrained">
	<h1>{m.bookmarklet_heading()}</h1>

	<p>{m.bookmarklet_intro()}</p>

	<p>{m.bookmarklet_supports()}</p>

	<div class="steps">
		<section>
			<h2>{m.bookmarklet_step_one()}</h2>
			<a class="btn primary bookmarklet" href={bookmarkletHref} data-sveltekit-reload>{m.bookmarklet_button()}</a>
			<p class="tip">{m.bookmarklet_tip()}</p>
		</section>

		<section>
			<h2>{m.bookmarklet_step_two()}</h2>
			<p>{m.bookmarklet_step_two_body()}</p>
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
