<script lang="ts">
	import {page} from '$app/state'
	import {createQuery} from '@tanstack/svelte-query'
	import {sdk} from '@radio4000/sdk'
	import {channelsCollection} from '$lib/tanstack/collections'
	import {appState} from '$lib/app-state.svelte'
	import {addToPlaylist, playTrack, setPlaylist} from '$lib/api'
	import Tracklist from '$lib/components/tracklist.svelte'
	import Icon from '$lib/components/icon.svelte'
	import type {Track} from '$lib/types'

	let slug = $derived(page.params.slug ?? '')
	let channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))
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

			const byId = new Map<string, Track>()
			for (const track of (mentionsRes.data || []) as Track[]) byId.set(track.id, track)
			for (const track of (descriptionRes.data || []) as Track[]) byId.set(track.id, track)

			return [...byId.values()].toSorted((a, b) => {
				const aDate = a.updated_at || a.created_at || ''
				const bDate = b.updated_at || b.created_at || ''
				return aDate < bDate ? 1 : aDate > bDate ? -1 : 0
			})
		},
		enabled: !!slug,
		staleTime: 5 * 60 * 1000
	}))

	let tracks = $derived(mentionsQuery.data ?? [])

	function playMentionTracks() {
		if (!tracks.length) return
		const ids = tracks.map((track) => track.id)
		setPlaylist(appState.active_deck_id, ids, {title: playlistTitle})
		playTrack(appState.active_deck_id, ids[0], null, 'play_search')
	}

	function queueMentionTracks() {
		if (!tracks.length) return
		addToPlaylist(
			appState.active_deck_id,
			tracks.map((track) => track.id)
		)
	}
</script>

<svelte:head>
	<title>{channel ? `${channel.name} mentions` : 'Mentions'}</title>
</svelte:head>

<section>
	<header>
		{#if tracks.length > 0}
			<menu class="row mentions-actions">
				<small class="mentions-count">{tracks.length} tracks mentioning @{slug}</small>
				<button type="button" onclick={playMentionTracks}><Icon icon="play-fill" size={16} />Play all</button>
				<button type="button" onclick={queueMentionTracks}><Icon icon="next-fill" size={16} />Queue all</button>
			</menu>
		{/if}
	</header>

	{#if mentionsQuery.isPending}
		<p class="empty"><rough-spinner spinner="14" interval="150"></rough-spinner> Loading mentions…</p>
	{:else if tracks.length > 0}
		<Tracklist {tracks} playlistTracks={tracks} {playlistTitle} grouped={false} playContext={true} showSlug={true} />
	{:else}
		<p class="empty">No tracks from other channels mention @{slug} yet.</p>
	{/if}

	{#if mentionsQuery.isError}
		<p class="empty">Could not load mentions right now.</p>
	{/if}
</section>

<style>
	header {
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.mentions-actions {
		align-items: center;
		justify-content: flex-end;
	}

	.mentions-count {
		margin-right: auto;
	}
</style>
