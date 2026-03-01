<script>
	import {sdk} from '@radio4000/sdk'
	import {appState} from '$lib/app-state.svelte'
	import * as m from '$lib/paraglide/messages'
	import Icon from '$lib/components/icon.svelte'
	import LanguageSwitcher from '$lib/components/language-switcher.svelte'
	import AppBuildInfo from '$lib/components/app-build-info.svelte'
	import {appChatUrl} from '$lib/config'

	const repo = __REPO_URL__ || __GIT_INFO__.remoteUrl
	const sha = $derived(__GIT_INFO__.sha)
	const commitDate = $derived(__GIT_INFO__.date)
</script>

<svelte:head>
	<title>{m.settings_title()}</title>
</svelte:head>

<article class="focused constrained">
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
			{m.settings_player()}
		</a>
		<a href="/settings/keyboard">
			<Icon icon="keyboard" />
			{m.settings_keyboard()}
		</a>
		{#if appState.user}
			<button onclick={() => sdk.auth.signOut()}>
				<Icon icon="eject" />
				{m.auth_log_out()}
			</button>
		{/if}
	</menu>

	<menu class="nav-vertical">
		<a href="/about">
			<Icon icon="circle-info" />
			{m.nav_about()}
		</a>
		<a href="/docs">
			<Icon icon="document" />
			Docs
		</a>
		<a href={appChatUrl} rel="noreferrer">
			<Icon icon="message-circle" />
			{m.nav_chat()}
		</a>
		<a href="{repo}/blob/main/CHANGELOG.md" target="_blank" rel="noreferrer">
			<Icon icon="html" />
			{m.settings_changelog()}
		</a>
		{#if sha}
			<p class="build-info-row">
				<Icon icon="code-branch" />
				<AppBuildInfo {repo} {sha} {commitDate} showPresenceCount={true} />
			</p>
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
	.build-info-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		padding: 0.5rem;
	}
</style>
