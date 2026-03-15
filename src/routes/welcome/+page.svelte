<script>
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import {appName} from '$lib/config'
	import IconR4 from '$lib/components/icon-r4.svelte'
	import * as m from '$lib/paraglide/messages'

	const currentChannelSlug = $derived(appState.channel?.slug)
</script>

<svelte:head>
	<title>{m.welcome_title({appName})}</title>
</svelte:head>

<article class="constrained focused splash">
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
			{#if currentChannelSlug}
				<a href={resolve('/[slug]', {slug: currentChannelSlug})} class="btn primary">{m.channel_go_to_radio()}</a>
			{:else if appState.channels?.length}
				<button class="btn primary" type="button" disabled>{m.common_loading()}</button>
			{:else}
				<a href={resolve('/create-channel')} class="btn primary">{m.channel_create_radio()}</a>
			{/if}
		{:else}
			<a href={resolve('/auth/create-account') + '?redirect=' + resolve('/create-channel')} class="btn primary"
				>{m.header_start_your_radio()}</a
			>
			<a href={resolve('/auth/login')} class="btn">{m.nav_sign_in()}</a>
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
</style>
