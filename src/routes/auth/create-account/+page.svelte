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
</script>

<svelte:head>
	<title>{m.auth_create_page_title()}</title>
</svelte:head>

<article class="constrained focused">
	<figure class="logo">
		<IconR4 />
	</figure>

	<h1>{m.auth_create_account_title()}</h1>

	<AuthSignup onSuccess={handleSuccess} {redirect} />

	<footer>
		<p>{m.auth_already_have_account_intro()} <a href="/auth/login">{m.auth_card_login_title()}</a></p>
	</footer>
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
