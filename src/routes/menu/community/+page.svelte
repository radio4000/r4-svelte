<script>
	import {resolve} from '$app/paths'
	import {appName, communityLinks} from '$lib/config'
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
</article>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-block: 1rem;
	}

	h1 {
		margin: 0;
	}

	menu {
		margin: 0 0 1rem;
	}

	menu a small {
		display: block;
	}
</style>
