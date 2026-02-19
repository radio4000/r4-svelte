<script>
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import * as m from '$lib/paraglide/messages'
	import AuthLogin from '$lib/components/auth-login.svelte'
	import IconR4 from '$lib/components/icon-r4.svelte'

	const redirect = $derived(page.url.searchParams.get('redirect') || '/settings')
	let step = $state('providers')
	const isCheckEmail = $derived(step === 'linkSent')

	function handleSuccess() {
		goto(redirect)
	}
</script>

<svelte:head>
	<title>{m.auth_login_page_title()}</title>
</svelte:head>

<article class="constrained focused">
	<figure class="logo">
		<IconR4 />
	</figure>

	{#if !isCheckEmail}
		<h1>{m.auth_login_title()}</h1>
	{/if}

	<AuthLogin onSuccess={handleSuccess} {redirect} bind:step />

	{#if !isCheckEmail}
		<footer>
			<p>{m.auth_new_to_r4_intro()} <a href="/auth/create-account">{m.auth_card_create_title()}</a></p>
		</footer>
	{/if}
</article>

<style>
	h1 {
		margin: 0 auto 2rem;
		font-size: var(--font-7);
		text-align: center;
	}

	footer {
		margin-top: 3rem;
		text-align: center;
		color: var(--gray-9);
	}
</style>
