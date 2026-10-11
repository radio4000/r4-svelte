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

/** Cancellation is normal; other failures must reach the UI so sharing doesn't fail silently. */
export async function nativeShare(data: {title: string; text?: string; url: string}) {
	if (!canNativeShare()) return false
	try {
		await navigator.share(data)
		return true
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') return false
		throw error
	}
}
