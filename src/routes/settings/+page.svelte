<script>
	import {sdk} from '@radio4000/sdk'
	import {useAppState} from '$lib/app-state.svelte'

	const appState = useAppState()
	const sha = $derived(__GIT_INFO__.sha)

	async function logout() {
		await sdk.auth.signOut()
	}
</script>

<svelte:head>
	<title>Settings & About - R5</title>
</svelte:head>

<article class="SmallContainer">
	{#if appState?.user}
		<p class="row row--vcenter">Signed in as {appState.user.email} <button onclick={() => logout()}>Log out</button></p>
	{/if}

	<menu vertical>
		{#if !appState?.user}
			<a href="/auth">Create account or sign in</a>
		{/if}
		<a href="/settings/appearance">Appearance</a>
		<a href="/settings/keyboard">Keyboard shortcuts</a>
	</menu>

	<menu vertical>
		<a href="/recovery">Recovery</a>
		<a href="/about">About</a>
		<a href="https://matrix.to/#/#radio4000:matrix.org" rel="noreferrer">Chat &rarr;</a>
		{#if sha}
			<a href="https://github.com/radio4000/r4-sync-tests/commit/{sha}" target="_blank" rel="noreferrer">{sha} &rarr;</a
			>
		{/if}
	</menu>
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
