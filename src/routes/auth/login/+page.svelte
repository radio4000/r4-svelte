<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {appName} from '#lib/config.js'
	import * as m from '#lib/paraglide/messages.js'
	import AuthLogin from '#lib/components/auth-login.svelte'
	import IconR4 from '#lib/components/icon-r4.svelte'
	import Seo from '#lib/components/seo.svelte'

	const redirect = $derived(page.url.searchParams.get('redirect') || '/settings')
	let step = $state('providers')
	const isCheckEmail = $derived(step === 'linkSent')

	function handleSuccess() {
		// Kit 3's goto rejects URLs outside the app; land on settings instead of staying put.
		goto(redirect).catch(() => goto(resolve('settings')))
	}
</script>

<Seo title={m.auth_login_page_title()} plain />

<article class="constrained focused splash">
	<figure class="logo">
		<IconR4 />
	</figure>

	{#if !isCheckEmail}
		<h1>{m.auth_login_title({appName})}</h1>
	{/if}

	<AuthLogin onSuccess={handleSuccess} {redirect} bind:step />

	{#if !isCheckEmail}
		<footer>
			<p>
				{m.auth_new_to_r4_intro({appName})}
				<a href={resolve('/auth/create-account')}>{m.auth_card_create_title()}</a>
			</p>
			<p>
				<a href={resolve('/auth/reset-password')}>{m.auth_reset_page_title()}</a>
			</p>
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
