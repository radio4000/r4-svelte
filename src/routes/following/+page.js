import {getFollowers} from '$lib/api'
import {appStateCollection} from '$lib/collections'

/** @type {import('./$types').PageLoad} */
export async function load({parent}) {
	const {preload} = await parent()
	await preload()

	const appState = await appStateCollection.getOne(1)
	const followerId = appState?.channels?.[0] || 'local-user'
	const followings = await getFollowers(followerId)

	return {followings}
}
