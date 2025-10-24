<script>
	import {sdk} from '@radio4000/sdk'
	import {checkUser} from '$lib/api'
	import {useAppState} from '$lib/app-state.svelte'
	import {appStateCollection} from '$lib/collections'
	import {logger} from '$lib/logger'

	const log = logger.ns('auth').seal()
	let unsubscribe = null

	const appState = $derived(useAppState().data)

	$effect(() => {
		if (unsubscribe) return
		const {data} = sdk.supabase.auth.onAuthStateChange(handleAuthChange)
		unsubscribe = data.subscription?.unsubscribe
		return () => unsubscribe?.()
	})

	async function handleAuthChange(event, session) {
		log.log(event, `user = ${session?.user?.email}`)

		const user = session?.user
		const previousUserId = appState?.user?.id
		appStateCollection.update(1, (draft) => {
			draft.user = user
		})

		if (!user) {
			if (appState?.channels?.length) {
				log.log('cleaning_up_channels')
				appStateCollection.update(1, (draft) => {
					draft.channels = []
				})
			}
			return
		}

		const isNewSession = event === 'INITIAL_SESSION' && user.id !== previousUserId
		const isNewSignIn = event === 'SIGNED_IN' && user.id !== previousUserId
		log.log('auth_state', {isNewSession, isNewSignIn})
		if (isNewSession || isNewSignIn) {
			await checkUser()
		}
	}
</script>
