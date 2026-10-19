<script>
	import {resolve} from '$app/paths'
	import {sdk} from '@radio4000/sdk'
	import {appState} from '#lib/app-state.svelte.js'
	import {fetchAppStats} from '#lib/collections/channels.js'
	import {appName, conceptIcons} from '#lib/config.js'
	import Icon from '#lib/components/icon.svelte'
	import ChannelAvatar from '#lib/components/channel-avatar.svelte'
	import AppBuildInfo from '#lib/components/app-build-info.svelte'
	import * as m from '#lib/paraglide/messages.js'
	import {repoBlobUrl, repoUrl, repoCommitUrl} from '#lib/repo.js'
	import BackLink from '#lib/components/back-link.svelte'
	import LanguageSwitcher from '#lib/components/language-switcher.svelte'
	import Seo from '#lib/components/seo.svelte'
	import {appPresence} from '#lib/presence.svelte.js'

	const sha = __GIT_INFO__.sha
	const changelogHref = repoBlobUrl('CHANGELOG.md')
	const sourceHref = repoCommitUrl(sha)

	const isSignedIn = $derived(!!appState.user)
	const userChannel = $derived(appState.channel)

	let channelCount = $state(0)
	let trackCount = $state(0)
	$effect(() => {
		fetchAppStats().then((stats) => {
			channelCount = stats.channels
			trackCount = stats.tracks
		})
	})
</script>

<Seo title={m.menu_page_title({appName})} plain />

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/')} />
		<h1>{m.nav_menu()}</h1>
	</header>

	<menu class="nav-vertical">
		{#if userChannel}
			<a href={resolve('/[slug]', {slug: userChannel.slug})}>
				<span class="channel-avatar"
					><ChannelAvatar id={userChannel.image} alt={userChannel.name} /></span
				>
				{userChannel.name}
				<small>@{userChannel.slug}</small>
			</a>
		{:else if isSignedIn}
			<a href={resolve('/create-channel')}>
				<Icon icon="user" />
				{m.home_create_channel()}
			</a>
		{/if}
		{#if isSignedIn}
			<a href={resolve('/account')}>
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
		<a href={resolve('/history')}>
			<Icon icon={conceptIcons.history} />
			{m.nav_history()}
		</a>
		<a href={resolve('/stats')}>
			<Icon icon="chart-scatter" />
			{m.nav_stats()}
		</a>
		<a href={resolve('/apps')}>
			<Icon icon="tv" />
			{m.nav_apps()}
		</a>
		<a href={resolve('/menu/community')}>
			<Icon icon="users" />
			{m.nav_community()}
		</a>
		<a href={resolve('/about')}>
			<Icon icon="circle-info" />
			{m.nav_about()}
		</a>
	</menu>

	<menu class="nav-vertical">
		<a href={resolve('docs')}>
			<Icon icon="document" />
			{m.nav_docs()}
		</a>
		<a href={changelogHref} target="_blank" rel="noreferrer">
			<Icon icon="html" />
			{m.settings_changelog()}
		</a>
		{#if repoUrl}
			<a href={sourceHref || repoUrl} target="_blank" rel="noreferrer">
				<Icon icon="code-branch" />
				{m.nav_code()}
			</a>
		{/if}
	</menu>

	<LanguageSwitcher />

	<footer class="meta-footer">
		<p class="version"><AppBuildInfo /></p>
		{#if channelCount || trackCount || appPresence.count}
			<p class="stats">
				{#if channelCount}<a href={resolve('channels/all')}
						>{m.home_stats_channels({count: channelCount.toLocaleString()})}</a
					>{/if}
				{#if trackCount}<a href={resolve('tracks/recent')}
						>{m.home_stats_tracks({count: trackCount.toLocaleString()})}</a
					>{/if}
				{#if appPresence.count}<span>{m.home_stats_listeners({count: appPresence.count})}</span
					>{/if}
			</p>
		{/if}
	</footer>
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

	.meta-footer {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--font-2);
		color: var(--gray-9);
	}

	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;

		a {
			color: inherit;
			text-decoration: none;
			&:hover {
				text-decoration: underline;
			}
		}
	}
</style>
