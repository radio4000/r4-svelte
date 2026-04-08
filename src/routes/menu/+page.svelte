<script>
	import {resolve} from '$app/paths'
	import {sdk} from '@radio4000/sdk'
	import {appState} from '$lib/app-state.svelte'
	import {appName} from '$lib/config'
	import Icon from '$lib/components/icon.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import AppBuildInfo from '$lib/components/app-build-info.svelte'
	import * as m from '$lib/paraglide/messages'
	import {repoBlobUrl, repoUrl, repoCommitUrl} from '$lib/repo'
	import BackLink from '$lib/components/back-link.svelte'
	import LanguageSwitcher from '$lib/components/language-switcher.svelte'

	const sha = __GIT_INFO__.sha
	const changelogHref = repoBlobUrl('CHANGELOG.md')
	const sourceHref = repoCommitUrl(sha)

	const isSignedIn = $derived(!!appState.user)
	const userChannel = $derived(appState.channel)
</script>

<svelte:head>
	<title>Menu — {appName}</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/')} />
		<h1>Menu</h1>
	</header>

	<menu class="nav-vertical">
		{#if userChannel}
			<a href={resolve(`/${userChannel.slug}`)}>
				<span class="channel-avatar"
					><ChannelAvatar id={userChannel.image} alt={userChannel.name} /></span
				>
				{userChannel.name}
				<small>@{userChannel.slug}</small>
			</a>
			<a href={resolve('/settings/account')}>
				<Icon icon="user" />
				{m.settings_account()}
				<small>{appState.user?.email}</small>
			</a>
			<button onclick={() => sdk.auth.signOut()}>
				<Icon icon="eject" />
				{m.auth_log_out()}
			</button>
		{:else if isSignedIn}
			<a href={resolve('/create-channel')}>
				<Icon icon="user" />
				{m.home_create_channel()}
			</a>
			<a href={resolve('/settings/account')}>
				<Icon icon="user" />
				{m.settings_account()}
				<small>{appState.user?.email}</small>
			</a>
			<button onclick={() => sdk.auth.signOut()}>
				<Icon icon="eject" />
				{m.auth_log_out()}
			</button>
		{:else}
			<a href={resolve('/auth')}>
				<Icon icon="user" />
				{m.auth_create_or_signin()}
			</a>
		{/if}
	</menu>

	<menu class="nav-vertical">
		<a href={resolve('/settings')}>
			<Icon icon="settings" />
			{m.nav_settings()}
		</a>
		<a href={resolve('/about')}>
			<Icon icon="circle-info" />
			{m.nav_about()}
		</a>
		<a href={resolve('/apps')}>
			<Icon icon="tv" />
			{m.nav_apps()}
		</a>
		<a href={resolve('/menu/community')}>
			<Icon icon="users" />
			Community
		</a>
	</menu>

	<menu class="nav-vertical">
		<a href={changelogHref} target="_blank" rel="noreferrer">
			<Icon icon="html" />
			{m.settings_changelog()}
		</a>
		{#if repoUrl}
			<a href={sourceHref || repoUrl} target="_blank" rel="noreferrer">
				<Icon icon="code-branch" />
				Code
			</a>
		{/if}
		<a href={resolve('/docs')}>
			<Icon icon="document" />
			Docs
		</a>
	</menu>

	<LanguageSwitcher />

	<p class="version"><AppBuildInfo /></p>
</article>

<style>
	menu {
		margin: 0 0 1rem;
	}

	menu a small {
		display: block;
	}

	.channel-avatar {
		width: 1.25rem;
		height: 1.25rem;
		flex-shrink: 0;
		:global(img, svg) {
			width: 100%;
			height: 100%;
			border-radius: calc(var(--border-radius) - 0.1rem);
			object-fit: cover;
		}
	}

	.version {
		font-size: var(--font-2);
		color: var(--gray-9);
	}
</style>
