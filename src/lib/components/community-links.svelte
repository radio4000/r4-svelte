<script>
	import {resolve} from '$app/paths'
	import {appChatUrl, appDiscordUrl, appName, appSocialUrl} from '$lib/config'
	import {repoUrl} from '$lib/repo'
</script>

<nav>
	<a href={repoUrl} target="_blank" rel="noreferrer">Source <small>how it's built</small></a> &rarr;
	<a href={resolve('/docs')}>Docs <small>how things work</small></a>
</nav>

<nav>
	Chat on <a href={appDiscordUrl} target="_blank" rel="noreferrer">Discord chat</a> or
	<a href={appChatUrl} target="_blank" rel="noreferrer">Matrix chat</a>. Follow along on
	<a href={appSocialUrl} target="_blank" rel="noreferrer">Bluesky</a>
</nav>
<nav>
	&nbsp; &nbsp; &nbsp;
	<a href={resolve('/')} class="ghost">Explore radios</a> or more
	<a href={resolve('/about')} class="ghost">about {appName}&hellip;</a>
</nav>

<style>
	nav {
		font-size: var(--font-4);
		color: var(--gray-10);
		margin: 0;
	}

	a[href^='https://']:not(.btn):not([data-no-external-icon])::after {
		display: none;
	}
</style>
