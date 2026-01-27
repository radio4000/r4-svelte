<script>
	import {sdk} from '@radio4000/sdk'
	import * as m from '$lib/paraglide/messages'

	let {onEmailClick, redirect = '/settings'} = $props()

	function signInWithProvider(provider) {
		sdk.supabase.auth.signInWithOAuth({
			provider,
			options: {
				redirectTo: window.location.origin + redirect
			}
		})
	}
</script>

<menu>
	<button type="button" onclick={onEmailClick}>{m.auth_continue_with_email()}</button>
	<button type="button" onclick={() => signInWithProvider('google')}>{m.auth_continue_with_google()}</button>
	<button type="button" onclick={() => signInWithProvider('facebook')}>{m.auth_continue_with_facebook()}</button>
</menu>

<style>
	menu {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
</style>
