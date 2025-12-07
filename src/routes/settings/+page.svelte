<script>
	import {sdk} from '@radio4000/sdk'
	import {appState} from '$lib/app-state.svelte'
	import * as m from '$lib/paraglide/messages'
	import LanguageSwitcher from '$lib/components/language-switcher.svelte'

	const sha = $derived(__GIT_INFO__.sha)

	async function logout() {
		await sdk.auth.signOut()
	}
</script>

<svelte:head>
	<title>{m.settings_title()}</title>
</svelte:head>

<article class="SmallContainer">
	{#if appState.user}
		<p class="row row--vcenter">
			{m.auth_signed_in_as({email: appState.user.email})} <button onclick={() => logout()}>{m.auth_log_out()}</button>
		</p>
	{/if}

	<menu data-vertical>
		{#if !appState.user}
			<a href="/auth">{m.auth_create_or_signin()}</a>
		{/if}
		<a href="/settings/appearance">{m.settings_appearance()}</a>
		<a href="/settings/keyboard">{m.settings_keyboard()}</a>
	</menu>

	<menu data-vertical>
		<a href="/about">{m.nav_about()}</a>
		<a href="https://matrix.to/#/#radio4000:matrix.org" rel="noreferrer">{m.nav_chat()} &rarr;</a>
		{#if sha}
			<a href="https://github.com/radio4000/r4-sync-tests/commit/{sha}" target="_blank" rel="noreferrer"
				>Source code {sha} &rarr;</a
			>
		{/if}
	</menu>

	<LanguageSwitcher />
</article>

<style>
	article {
		margin-bottom: calc(var(--player-compact-size));

		> p {
			margin-bottom: 1rem;
		}
	}
	menu {
		margin: 0 0 0.5rem;
	}
</style>
