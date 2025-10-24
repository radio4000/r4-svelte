<script>
	import {sdk} from '@radio4000/sdk'
	import {checkUser} from '$lib/api'
	import {appStateCollection} from '$lib/collections'
	import {logger} from '$lib/logger'
	import {useLiveQuery} from '$lib/tanstack-svelte-db-useLiveQuery-patched.svelte'

	const log = logger.ns('auth').seal()
	let unsubscribe = null

	const query = useLiveQuery((q) => q.from({state: appStateCollection}).findOne())
	const appState = $derived(query.data)

	$effect(() => {
		if (unsubscribe) return
		const {data} = sdk.supabase.auth.onAuthStateChange(handleAuthChange)
		unsubscribe = data.subscription?.unsubscribe
		return () => unsubscribe?.()
	})

	async function handleAuthChange(event, session) {
		log.debug(event, `user = ${session?.user?.email}`)

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
