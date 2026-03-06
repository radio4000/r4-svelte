<script>
	import {appState} from '$lib/app-state.svelte'
	import IconR4 from '$lib/components/icon-r4.svelte'
	import * as m from '$lib/paraglide/messages'
</script>

<svelte:head>
	<title>Welcome to Radio4000</title>
</svelte:head>

<article class="constrained focused">
	<figure class="logo">
		<IconR4 />
	</figure>

	<p>{m.welcome_tagline_channel()}</p>
	<p>{m.welcome_tagline_metadata()}</p>

	<ul>
		<li>{m.welcome_feature_archive()}</li>
		<li>{m.welcome_feature_decks()}</li>
		<li>{m.welcome_feature_follow()}</li>
		<li>{m.welcome_feature_open()}</li>
	</ul>

	<menu>
		{#if appState.user}
			{#if appState.channels?.length}
				<a href="/{appState.channel?.slug}" class="btn primary">{m.channel_go_to_radio()}</a>
			{:else}
				<a href="/create-channel" class="btn primary">{m.channel_create_radio()}</a>
			{/if}
		{:else}
			<a href="/auth/create-account?redirect=/create-channel" class="btn primary">{m.header_start_your_radio()}</a>
			<a href="/auth/login" class="btn">{m.nav_sign_in()}</a>
		{/if}
	</menu>
</article>

<style>
	.constrained {
		display: flex;
		flex-flow: column;
		gap: 0.5rem;
		padding-inline: 1.5rem;
	}

	p,
	ul {
		font-size: var(--font-6);
	}

	ul {
		font-size: var(--font-5);
		margin-block: 1rem;
	}

	li {
		margin-block: 0.3rem;
	}

	menu {
		margin-block: 2rem;
		gap: 0.5rem;
		justify-content: center;
		align-items: center;
		.btn {
			font-size: var(--font-5);
			padding: 0.5rem 1rem;
		}
	}

	p.center {
		text-align: center;
		font-size: 1rem;
	}
</style>
