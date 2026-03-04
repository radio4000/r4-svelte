<script>
	import {appState} from '$lib/app-state.svelte'
	import IconR4 from '$lib/components/icon-r4.svelte'
	import * as m from '$lib/paraglide/messages'
	import CommunityLinks from '$lib/components/community-links.svelte'
</script>

<svelte:head>
	<title>Welcome to Radio4000</title>
</svelte:head>

<article class="constrained focused">
	<figure class="logo">
		<IconR4 />
	</figure>

	<p>A channel is whoever you want to be — one radio, lotsa tracks.</p>
	<p>A track is a pointer with opinions: a URL, a title, #tags.</p>
	<p>Add YouTube, SoundCloud, any media URL. Get metadata from MusicBrainz, Discogs.</p>

	<ul>
		<li>Search, filter, #tag, build views across your archive</li>
		<li>Play across multiple decks. Broadcast live or let auto-radio do it</li>
		<li>Follow other radios, discover what people are curating</li>
		<li>Free and open source. No tracking, no ads. <small>SDK, CLI, API</small></li>
	</ul>

	<p>
		In other words.. Make your radio, add some tracks by pasting in YouTube urls. Describe your tracks as you want.
		Share with friends.
	</p>

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

	<CommunityLinks />
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
