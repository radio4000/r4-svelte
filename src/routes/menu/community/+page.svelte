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
		<a href="https://forms.gle/BcqxRWjTJBDCku4L9" target="_blank" rel="noreferrer">
			<Icon icon="message-circle" />
			Feedback
		</a>
		<a href="mailto:{appContactEmail}">
			<Icon icon="message-circle" />
			Contact
			<small>{appContactEmail}</small>
		</a>
	</menu>
</article>

<style>
	menu a small {
		display: block;
	}
</style>
