<script>
	import {resolve} from '$app/paths'
	import {appName, communityLinks, appContactEmail} from '#lib/config.js'
	import BackLink from '#lib/components/back-link.svelte'
	import Icon from '#lib/components/icon.svelte'
	import Seo from '#lib/components/seo.svelte'
	import * as m from '#lib/paraglide/messages.js'
</script>

<Seo title={m.community_page_title({appName})} plain />

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/menu')} />
		<h1>{m.nav_community()}</h1>
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
			{m.community_feedback()}
		</a>
		<a href="mailto:{appContactEmail}">
			<Icon icon="message-circle" />
			{m.community_contact()}
			<small>{appContactEmail}</small>
		</a>
	</menu>

	<menu class="nav-vertical">
		<a href="https://v1.radio4000.com/" target="_blank" rel="noreferrer">
			<Icon icon="history" />
			{m.community_v1_link()}
		</a>
		<a href="https://v2.radio4000.com/" target="_blank" rel="noreferrer">
			<Icon icon="history" />
			{m.community_v2_link()}
		</a>
	</menu>
</article>

<style>
	menu a small {
		display: block;
	}
</style>
