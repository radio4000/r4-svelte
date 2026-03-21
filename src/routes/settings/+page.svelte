<script>
	import {resolve} from '$app/paths'
	import {sdk} from '@radio4000/sdk'
	import {appState} from '$lib/app-state.svelte'
	import * as m from '$lib/paraglide/messages'
	import Icon from '$lib/components/icon.svelte'
	import LanguageSwitcher from '$lib/components/language-switcher.svelte'
	import BackLink from '$lib/components/back-link.svelte'
</script>

<svelte:head>
	<title>{m.settings_title()}</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/menu')} />
		<h1>{m.settings_title()}</h1>
	</header>

	<menu class="nav-vertical">
		{#if !appState.user}
			<a href={resolve('/auth')}>
				<Icon icon="user" />
				{m.auth_create_or_signin()}
			</a>
		{:else}
			<a href={resolve('/settings/account')}>
				<Icon icon="user" />
				{m.settings_account()}
				<small>{appState.user.email}</small>
			</a>
			<button onclick={() => sdk.auth.signOut()}>
				<Icon icon="eject" />
				{m.auth_log_out()}
			</button>
		{/if}
	</menu>

	<LanguageSwitcher />

	<menu class="nav-vertical">
		<a href={resolve('/settings/appearance')}>
			<Icon icon="palette" />
			{m.settings_appearance()}
		</a>
		<a href={resolve('/settings/player')}>
			<Icon icon="tv" />
			{m.settings_player()}
		</a>
		<a href={resolve('/settings/keyboard')}>
			<Icon icon="keyboard" />
			{m.settings_keyboard()}
		</a>
		<a href={resolve('/settings/analytics')}>
			<Icon icon="eye" />
			Analytics
		</a>
		<a href={resolve('/settings/import')}>
			<Icon icon="document-download" />
			Import
		</a>
	</menu>
</article>

<style>
	menu {
		margin: 0 0 1rem;
	}

	menu:first-of-type {
		margin-bottom: 0;
	}
	menu a small {
		display: block;
	}
</style>
