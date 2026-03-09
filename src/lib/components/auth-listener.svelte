<script>
	import {sdk} from '@radio4000/sdk'
	import {goto} from '$app/navigation'
	import {env} from '$env/dynamic/public'
	const PUBLIC_APP_MODE = env.PUBLIC_APP_MODE
	import {checkUser} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import {loadUserFollows} from '$lib/collections/follows'

	let unsubscribe = null

	$effect(() => {
		if (PUBLIC_APP_MODE === 'standalone') return
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
			goto(`/settings/account/email?${query}`)
		}
	})

	$effect(() => {
		if (PUBLIC_APP_MODE === 'standalone') return
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
			goto('/auth/reset-password/confirm')
			return
		}

		if (!user) {
			if (appState.channels?.length) {
				appState.channel = undefined
				appState.channels = []
			}
			return
		}

		const isNewSession = event === 'INITIAL_SESSION' && user.id !== previousUserId
		const isNewSignIn = event === 'SIGNED_IN' && user.id !== previousUserId

		if (isNewSession || isNewSignIn) {
			await checkUser()
			loadUserFollows()
		} else if (event === 'INITIAL_SESSION' && user) {
			checkUser()
			loadUserFollows()
		}
	}
</script>
