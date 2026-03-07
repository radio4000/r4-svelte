<script>
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import * as m from '$lib/paraglide/messages'
	import AuthSignup from '$lib/components/auth-signup.svelte'
	import IconR4 from '$lib/components/icon-r4.svelte'

	const redirect = $derived(page.url.searchParams.get('redirect') || '/settings')

	function handleSuccess() {
		goto(redirect)
	}
	let step = $state('providers')
	const isCheckEmail = $derived(step === 'linkSent' || step === 'confirmEmail')
</script>

<svelte:head>
	<title>{m.auth_create_page_title()}</title>
</svelte:head>

<article class="constrained constrained--smaller focused splash">
	<figure class="logo">
		<IconR4 />
	</figure>

	{#if !isCheckEmail}
		<h1>{m.auth_create_account_title()}</h1>
	{/if}

	<AuthSignup {redirect} bind:step onSuccess={handleSuccess} />

	{#if !isCheckEmail}
		<footer>
			<p>{m.auth_already_have_account_intro()} <a href="/auth/login">{m.auth_card_login_title()}</a></p>
		</footer>
	{/if}
</article>

<style>
	.constrained {
		display: flex;
		flex-flow: column;
	}

	h1 {
		margin: 0 auto 2rem;
		font-size: var(--font-7);
	}

	footer {
		margin-top: 2rem;
		text-align: center;
	}
</style>
