import {viewFromUrl} from '$lib/views'
import {browser} from '$app/environment'
import {error, redirect} from '@sveltejs/kit'
import {sdk} from '@radio4000/sdk'
import {isMissingRow} from './not-found'
import {normalizeTrackMedia} from '$lib/collections/tracks'
import {SECTION_TRACK_LIMIT} from '$lib/config'
import type {Channel, Track} from '$lib/types'

export const ssr = true

const PRIVATE_ROUTE_IDS = new Set([
	'/[slug]/edit',
	'/[slug]/batch-edit',
	'/[slug]/delete',
	'/[slug]/backup',
	'/[slug]/doctor',
	'/[slug]/tracks/[tid]/delete',
	'/[slug]/tracks/[tid]/(tabs)/edit'
])

export async function load({url, route, params}) {
	const routeId = route.id ?? ''
	if (PRIVATE_ROUTE_IDS.has(routeId)) {
		const {
			data: {user}
		} = await sdk.supabase.auth.getUser()
		if (!user) {
			const redirectTo = `${url.pathname}${url.search}`
			throw redirect(307, `/auth?redirect=${encodeURIComponent(redirectTo)}`)
		}
		const canEdit = await sdk.channels.canEditChannel(params.slug)
		if (!canEdit) {
			throw redirect(307, `/${params.slug}`)
		}
	}

	// The load fetches only on the server; the browser reads through the
	// collections (live queries in the layout), so client navs hit the cache.
	// Hydration reuses the serialized server data — this branch runs on navs only.
	if (browser) {
		return {view: viewFromUrl(url), channel: null, tracks: []}
	}

	// Server data feeds the first render (SSR + hydration); live queries take
	// over once synced. A failed track list is not worth failing the page over.
	const [{data: channel, error: channelError}, {data: tracks}] = await Promise.all([
		sdk.channels.readChannel(params.slug),
		sdk.channels.readChannelTracks(params.slug, SECTION_TRACK_LIMIT)
	])

	if (!channel) {
		if (channelError && !isMissingRow(channelError))
			error(500, `Could not load channel @${params.slug}`)
		error(404, `Channel not found: @${params.slug}`)
	}

	return {
		view: viewFromUrl(url),
		channel: (channel as Channel) ?? null,
		tracks: ((tracks ?? []) as Track[]).map(normalizeTrackMedia)
	}
}
