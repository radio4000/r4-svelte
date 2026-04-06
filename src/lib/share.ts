import type {Channel, Track} from '$lib/types'
import {appUrl, appPlayerUrl} from '$lib/config'
import {resolve} from '$app/paths'

const origin = globalThis.location?.origin ?? appUrl

export const channelUrl = (channel: Channel) => `${origin}${resolve(`/${channel.slug}`)}`

export const trackUrl = (channel: Channel, track: Track) =>
	`${origin}${resolve(`/${channel.slug}/tracks/${track.id}`)}`

export const channelEmbed = (channel: Channel) =>
	`<iframe src="${appPlayerUrl}/v2/?slug=${channel.slug}" width="320" height="500"></iframe>`

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
