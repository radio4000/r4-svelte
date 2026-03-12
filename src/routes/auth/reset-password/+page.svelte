<script>
	import {resolve} from '$app/paths'
	import R4PasswordReset from '$lib/components/r4-password-reset.svelte'
	import * as m from '$lib/paraglide/messages'
	import {appChatUrl, appName} from '$lib/config'

	let emailSent = $state(false)

	function handleResetPassword(event) {
		const {error} = event.detail
		if (!error) {
			emailSent = true
		}
	}
</script>

<svelte:head>
	<title>{m.auth_reset_page_title()}</title>
</svelte:head>

<article class="constrained focused splash">
	<header>
		<p><a href={resolve('/auth')}>{m.auth_page_title()}</a> / {m.auth_reset_page_title()}</p>
	</header>

	<h1>{m.auth_reset_heading()}</h1>
	<p>{m.auth_reset_prompt_email({appName})}</p>
	<br />
	<p>{m.auth_reset_instruction()}</p>
	<br />

	{#if emailSent}
		<p><strong>{m.auth_reset_email_sent()}</strong></p>
	{:else}
		<R4PasswordReset onsubmit={handleResetPassword} />
	{/if}

	<footer>
		<p>
			<small>
				{m.auth_reset_help_intro()}
				<a href={appChatUrl} target="_blank">{m.auth_reset_help_link()}</a>
			</small>
		</p>
	</footer>
</article>

<style>
	h1 {
		margin: 3vh auto;
		font-size: var(--font-7);
		text-align: center;
	}

	footer {
		margin-top: 3rem;
		text-align: center;
	}
</style>
