<script lang="ts">
	import {page} from '$app/state'
	import {createQuery} from '@tanstack/svelte-query'
	import {sdk} from '@radio4000/sdk'
	import {tracksCollection} from '$lib/collections/tracks'
	import {appState} from '$lib/app-state.svelte'
	import {addToPlaylist, playTrack, setPlaylist} from '$lib/api'
	import Tracklist from '$lib/components/tracklist.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import Subpage from '$lib/components/subpage.svelte'
	import ChannelNavControlsPortal from '$lib/components/channel-nav-controls-portal.svelte'
	import Icon from '$lib/components/icon.svelte'
	import type {Track} from '$lib/types'
	import * as m from '$lib/paraglide/messages'

	let slug = $derived(page.params.slug ?? '')
	let mentionTokens = $derived.by(() => {
		const lower = slug.toLowerCase()
		return [...new Set([slug, lower, `@${slug}`, `@${lower}`].filter(Boolean))]
	})
	let playlistTitle = $derived(`@${slug} mentions`)

	const mentionsQuery = createQuery(() => ({
		queryKey: ['tracks', 'mentions', 'v2', slug, mentionTokens.join(',')],
		queryFn: async () => {
			const [mentionsRes, descriptionRes] = await Promise.all([
				sdk.supabase
					.from('channel_tracks')
					.select('*')
					.overlaps('mentions', mentionTokens)
					.neq('slug', slug)
					.order('updated_at', {ascending: false})
					.order('created_at', {ascending: false})
					.limit(4000),
				sdk.supabase
					.from('channel_tracks')
					.select('*')
					.ilike('description', `%@${slug}%`)
					.neq('slug', slug)
					.order('updated_at', {ascending: false})
					.order('created_at', {ascending: false})
					.limit(4000)
			])
			if (mentionsRes.error) throw mentionsRes.error
			if (descriptionRes.error) throw descriptionRes.error

			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const byId = new Map<string, Track>()
			for (const track of (mentionsRes.data || []) as Track[]) byId.set(track.id, track)
			for (const track of (descriptionRes.data || []) as Track[]) byId.set(track.id, track)

			const mergedTracks = [...byId.values()].toSorted((a, b) => {
				const aDate = a.updated_at || a.created_at || ''
				const bDate = b.updated_at || b.created_at || ''
				return aDate < bDate ? 1 : aDate > bDate ? -1 : 0
			})

			tracksCollection.utils.writeBatch(() => {
				for (const track of mergedTracks) tracksCollection.utils.writeUpsert(track)
			})

			return mergedTracks
		},
		enabled: !!slug,
		staleTime: 5 * 60 * 1000
	}))

	let q = $state('')
	let tracks = $derived(mentionsQuery.data ?? [])
	const matchTrack = (t: Track, q: string) =>
		!q || t.title?.toLowerCase().includes(q.toLowerCase()) || t.description?.toLowerCase().includes(q.toLowerCase())
	let filteredTracks = $derived(tracks.filter((t) => matchTrack(t, q)))

	function playMentionTracks() {
		if (!filteredTracks.length) return
		const ids = filteredTracks.map((track) => track.id)
		setPlaylist(appState.active_deck_id, ids, {title: playlistTitle})
		playTrack(appState.active_deck_id, ids[0], null, 'play_search')
	}

	function queueMentionTracks() {
		if (!filteredTracks.length) return
		addToPlaylist(
			appState.active_deck_id,
			filteredTracks.map((track) => track.id)
		)
	}
</script>

<svelte:head>
	<title>{m.mentions_title({handle: slug})}</title>
</svelte:head>

<ChannelNavControlsPortal controls={navControls} />

{#snippet navControls()}
	{#if tracks.length}
		<SearchInput
			bind:value={q}
			placeholder={m.mentions_search_placeholder({count: tracks.length, handle: `@${slug}`})}
		/>
		<button type="button" title={m.search_play_all()} onclick={playMentionTracks}><Icon icon="play-fill" /></button>
		<button type="button" title={m.search_queue_all()} onclick={queueMentionTracks}><Icon icon="next-fill" /></button>
	{/if}
{/snippet}

<section>
	<Subpage
		title={m.mentions_title({handle: slug})}
		loading={mentionsQuery.isPending}
		error={mentionsQuery.isError}
		errorText={m.mentions_error()}
		empty={tracks.length === 0}
		emptyText={m.mentions_empty({handle: `@${slug}`})}
	>
		<Tracklist
			tracks={filteredTracks}
			playlistTracks={tracks}
			{playlistTitle}
			grouped={false}
			playContext={true}
			showSlug={true}
		/>
	</Subpage>
</section>
