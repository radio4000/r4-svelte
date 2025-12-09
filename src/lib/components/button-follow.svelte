<script>
	import {followsCollection, followChannel, unfollowChannel} from '../../routes/tanstack/collections'
	import {useLiveQuery, eq} from '@tanstack/svelte-db'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	/** @type {{channel: import('$lib/types').Channel, label?: string, class?: string}} */
	let {channel, label, ...rest} = $props()

	const query = useLiveQuery((q) => q.from({f: followsCollection}).where(({f}) => eq(f.channelId, channel.id)))
	let following = $derived(query.data?.length > 0)

	const toggle = (e) => {
		e.stopPropagation()
		e.preventDefault()
		if (following) unfollowChannel(channel.id)
		else followChannel(channel)
	}
</script>

<button
	onclick={toggle}
	title={following ? m.button_unfollow() : m.button_follow()}
	aria-label={following ? m.button_unfollow() : m.button_follow()}
	{...rest}
>
	<Icon icon={following ? 'favorite-fill' : 'favorite'} size={20} />
	{label}
</button>
