<script>
	import {sdk} from '@radio4000/sdk'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {capabilities} from '#lib/modes.js'
	import {checkUser} from '#lib/api.js'
	import {appState} from '#lib/app-state.svelte.js'
	import {loadUserFollows} from '#lib/collections/follows.js'

	/** @type {(() => void) | null} */
	let unsubscribe = null

	$effect(() => {
		if (!capabilities.auth) return
		if (typeof window === 'undefined') return
		const hash = window.location.hash.substring(1)
		if (!hash) return

		const params = new URLSearchParams(hash)
		const message = params.get('message')
		const error = params.get('error_description') || params.get('error')

		if (message || error) {
			const query = new URLSearchParams({
				...(message && {message}),
				...(error && {error})
			}).toString()
			goto(`${resolve('account/email')}?${query}`)
		}
	})

	$effect(() => {
		if (!capabilities.auth) return
		if (unsubscribe) return
		const {data} = sdk.supabase.auth.onAuthStateChange(handleAuthChange)
		unsubscribe = data.subscription?.unsubscribe
		return () => unsubscribe?.()
	})

	async function handleAuthChange(event, session) {
		const user = session?.user
		const previousUserId = appState.user?.id
		appState.user = user

		if (event === 'PASSWORD_RECOVERY') {
			goto(resolve('auth/reset-password/confirm'))
			return
		}

		if (!user) {
			if (appState.channels?.length) {
				appState.channel = undefined
				appState.channels = []
			}
			return
		}

		const isNewSignIn = event === 'SIGNED_IN' && user.id !== previousUserId

		if (event === 'INITIAL_SESSION' || isNewSignIn) {
			// Same user as persisted: their channel ids are already in appState, so follows can load now.
			// The call after checkUser() is a cache hit unless the channel changed.
			if (user.id === previousUserId) loadUserFollows()
			await checkUser(user)
			loadUserFollows()
		}
	}
</script>
