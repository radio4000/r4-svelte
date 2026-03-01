import type {Channel, Track} from '$lib/types'
import {appUrl} from '$lib/config'

const PLAYER_URL = 'https://player.radio4000.com'

export const channelUrl = (channel: Channel) => `${appUrl}/${channel.slug}`

export const trackUrl = (channel: Channel, track: Track) => `${appUrl}/${channel.slug}/tracks/${track.id}`

export const channelEmbed = (channel: Channel) =>
	`<iframe src="${PLAYER_URL}/?slug=${channel.slug}" width="320" height="500"></iframe>`

export const copyToClipboard = (text: string) =>
	navigator.clipboard.writeText(text).then(
		() => true,
		() => false
	)

export const canNativeShare = () => typeof navigator !== 'undefined' && !!navigator.share

export const nativeShare = (data: {title: string; text?: string; url: string}) =>
	canNativeShare()
		? navigator.share(data).then(
				() => true,
				() => false
			)
		: Promise.resolve(false)
