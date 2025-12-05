<script>
	import {sdk} from '@radio4000/sdk'
	import {checkUser} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'

	let unsubscribe = null

	$effect(() => {
		if (unsubscribe) return
		const {data} = sdk.supabase.auth.onAuthStateChange(handleAuthChange)
		unsubscribe = data.subscription?.unsubscribe
		return () => unsubscribe?.()
	})

	async function handleAuthChange(event, session) {
		const user = session?.user
		const previousUserId = appState.user?.id
		appState.user = user

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
		} else if (event === 'INITIAL_SESSION' && user) {
			// Background sync - verify channels match remote
			checkUser()
		}
	}
</script>
