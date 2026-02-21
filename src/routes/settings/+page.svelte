<script>
	import {appState} from '$lib/app-state.svelte'
	import * as m from '$lib/paraglide/messages'
	import Icon from '$lib/components/icon.svelte'
	import LanguageSwitcher from '$lib/components/language-switcher.svelte'

	const repo = __REPO_URL__ || __GIT_INFO__.remoteUrl
	const sha = $derived(__GIT_INFO__.sha)
</script>

<svelte:head>
	<title>{m.settings_title()}</title>
</svelte:head>

<article class="constrained">
	<h1>{m.settings_title()}</h1>

	<menu class="nav-vertical">
		{#if !appState.user}
			<a href="/auth">
				<Icon icon="user" />
				{m.auth_create_or_signin()}
			</a>
		{:else}
			<a href="/settings/account">
				<Icon icon="user" />
				{m.settings_account()}
				<small>{appState.user.email}</small>
			</a>
		{/if}
		<a href="/settings/appearance">
			<Icon icon="palette" />
			{m.settings_appearance()}
		</a>
		<a href="/settings/player">
			<Icon icon="tv" />
			Player
		</a>
		<a href="/settings/keyboard">
			<Icon icon="keyboard" />
			{m.settings_keyboard()}
		</a>
	</menu>

	<menu class="nav-vertical">
		<a href="/about">
			<Icon icon="circle-info" />
			{m.nav_about()}
		</a>
		<a href="https://matrix.to/#/#radio4000:matrix.org" rel="noreferrer">
			<Icon icon="message-circle" />
			{m.nav_chat()}
		</a>
		<a href="{repo}/blob/main/CHANGELOG.md" target="_blank" rel="noreferrer">
			<Icon icon="html" />
			Changelog
		</a>
		{#if sha}
			<a href="{repo}/commit/{sha}" target="_blank" rel="noreferrer">
				<Icon icon="code-branch" />
				Source code {sha}
			</a>
		{/if}
	</menu>

	<LanguageSwitcher />
</article>

<style>
	h1 {
		margin-block: 0.5rem 1rem;
	}
	menu {
		margin: 0 0 1rem;
	}
	menu a small {
		display: block;
	}
</style>
