<script lang="ts">
	import {resolve} from '$app/paths'
	import {loadDeckView, playTrack} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import type {Track} from '$lib/types'
	import * as m from '$lib/paraglide/messages'

	interface Props {
		channelSlug?: string
		tags?: string[]
		matchingTracks?: Track[]
	}

	let {channelSlug = '', tags = $bindable([]), matchingTracks = []}: Props = $props()

	async function playChain() {
		if (!tags.length || !matchingTracks.length) return
		const trackIds = matchingTracks.map((t) => t.id)
		loadDeckView(
			appState.active_deck_id,
			{sources: [{channels: channelSlug ? [channelSlug] : undefined, tags}]},
			trackIds,
			{slug: channelSlug || undefined}
		)
		await playTrack(appState.active_deck_id, trackIds[0], null, 'user_click_track')
	}
</script>

{#if tags.length > 0}
	<div class="chain-bar">
		<menu class="tags">
			{#each tags as tag, i (tag)}
				{#if i > 0}<small>→</small>{/if}
				<button
					class="chip active"
					onclick={() => (tags = tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()))}
					aria-label={m.tag_chain_remove({tag})}>{tag}</button
				>
			{/each}
		</menu>
		<menu class="actions">
			<a
				href={resolve('/[slug]/tracks', {slug: channelSlug}) +
					`?tags=${tags.map(encodeURIComponent).join(',')}`}
			>
				{m.tag_chain_see_tracks({count: matchingTracks.length})}
			</a>
			<button class="primary" onclick={playChain} disabled={matchingTracks.length === 0}
				>▶ {m.common_play()}</button
			>
			<button onclick={() => (tags = [])} aria-label={m.tag_chain_clear()}>✕</button>
		</menu>
	</div>
{/if}

<style>
	.chain-bar {
		position: sticky;
		top: 3rem;
		z-index: 1;
		border: 1px dashed var(--gray-5);
		padding: 0.5rem;
		margin-left: 0.5rem;
	}

	.tags {
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.actions {
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		justify-content: flex-end;

		a {
			text-decoration: underline;
		}
	}
</style>
