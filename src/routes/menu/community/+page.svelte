<script>
	import {resolve} from '$app/paths'
	import {appName, communityLinks, appContactEmail} from '$lib/config'
	import BackLink from '$lib/components/back-link.svelte'
	import Icon from '$lib/components/icon.svelte'
</script>

<svelte:head>
	<title>Community — {appName}</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/menu')} />
		<h1>Community</h1>
	</header>

	<menu class="nav-vertical">
		{#each communityLinks as link (link.href)}
			<a href={link.href} target="_blank" rel="noreferrer">
				<Icon icon="message-circle" />
				{link.label}
				{#if link.description}<small>{link.description}</small>{/if}
			</a>
		{/each}
	</menu>

	<section class="contact">
		<h2>Contact</h2>
		<p><a href="mailto:{appContactEmail}">{appContactEmail}</a></p>
		<!-- TODO: replace action with a form endpoint when available -->
		<form method="post" action="mailto:{appContactEmail}" enctype="text/plain">
			<label>
				<span>Your email</span>
				<input type="email" name="from" placeholder="you@example.com" />
			</label>
			<label>
				<span>Message</span>
				<textarea name="body" rows="5" placeholder="Hello…"></textarea>
			</label>
			<button type="submit">Send</button>
		</form>
	</section>
</article>

<style>
	menu {
		margin: 0 0 1rem;
	}

	menu a small {
		display: block;
	}

	.contact {
		margin-top: 1.5rem;

		h2 {
			font-size: var(--font-4);
			font-weight: 600;
			margin: 0 0 0.5rem;
		}

		form {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
			margin-top: 0.75rem;
		}

		label {
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
			font-size: var(--font-3);
		}
	}
</style>
