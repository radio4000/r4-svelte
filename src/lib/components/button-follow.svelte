<script>
	import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
	import {eq} from '@tanstack/svelte-db'
	import {followsCollection, followChannel, unfollowChannel} from '#lib/collections/follows.js'
	import {appState} from '#lib/app-state.svelte.js'
	import Icon from '#lib/components/icon.svelte'
	import * as m from '#lib/paraglide/messages.js'

	/** @type {{channel: import('#lib/types.js').Channel, label?: string, class?: string}} */
	let {channel, label, ...rest} = $props()

	let userChannelId = $derived(appState.channels?.[0])

	const followQuery = useLiveQuery((q) =>
		q.from({follows: followsCollection}).where(({follows}) => eq(follows.id, channel.id))
	)

	let following = $derived(followQuery.data?.length > 0)

	const toggle = (e) => {
		e.stopPropagation()
		e.preventDefault()
		if (following) unfollowChannel(channel.id)
		else followChannel(channel.id)
	}
</script>

{#if userChannelId}
	<button
		onclick={toggle}
		title={following ? m.common_unfollow() : m.common_follow()}
		aria-label={following ? m.common_unfollow() : m.common_follow()}
		{...rest}
	>
		<Icon icon={following ? 'favorite-fill' : 'favorite'} />
		{label}
	</button>
{/if}
