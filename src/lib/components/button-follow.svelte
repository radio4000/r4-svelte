<script>
	import {followChannel, isFollowing as isFollowingChannel, unfollowChannel} from '$lib/api'
	import {useAppState} from '$lib/app-state.svelte'
	import Icon from '$lib/components/icon.svelte'

	/** @type {{channel: import('$lib/types').Channel, label?: string, class?: string}} */
	let {channel, label, ...rest} = $props()

	const appState = $derived(useAppState().data)

	let followerId = $derived(appState?.channels?.[0] || 'local-user')
	let isFollowing = $state(false)

	$effect(() => {
		isFollowingChannel(followerId, channel.id).then((x) => {
			isFollowing = x
		})
	})

	async function toggleFollow(event) {
		event.stopPropagation()
		event.preventDefault()

		if (isFollowing) {
			await unfollowChannel(followerId, channel.id)
			isFollowing = false
		} else {
			await followChannel(followerId, channel.id)
			isFollowing = true
		}
	}
</script>

<button
	onclick={toggleFollow}
	title={isFollowing ? 'Unfollow' : 'Follow'}
	aria-label={isFollowing ? 'Unfollow' : 'Follow'}
	{...rest}
>
	<Icon icon={isFollowing ? 'favorite-fill' : 'favorite'} size={20} />
	{label}
</button>
