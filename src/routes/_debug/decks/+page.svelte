<script>
	import {appState} from '$lib/app-state.svelte'
	import {addDeck, removeDeck} from '$lib/app-state.svelte'
	import {toggleDeckCompact, togglePlayerExpanded, toggleVideo, toggleQueuePanel} from '$lib/api'
	import InputRange from '$lib/components/input-range.svelte'

	let deckIds = $derived(Object.keys(appState.decks).map(Number))

	function setNormal(deck) {
		deck.compact = false
		deck.expanded = false
	}
	function setCompact(deck) {
		deck.compact = true
		deck.expanded = false
	}
	function setExpanded(deck) {
		deck.expanded = true
		deck.compact = false
		if (deck.hide_video_player) deck.hide_video_player = false
	}

	function layoutLabel(deck) {
		if (deck.expanded) return 'expanded'
		if (deck.compact) return 'compact'
		return 'normal'
	}
</script>

<svelte:head>
	<title>Debug: Decks</title>
</svelte:head>

<div class="constrained">
	<menu class="nav-grouped">
		<a href="/_debug">&larr;</a>
	</menu>

	<h1>Decks</h1>
	<p>Inspect and manipulate deck state. Changes are live and persist to localStorage.</p>

	<section>
		<menu>
			<button onclick={() => addDeck()}>Add deck</button>
			<button
				onclick={() => {
					for (const id of deckIds) setNormal(appState.decks[id])
				}}>All normal</button
			>
			<button
				onclick={() => {
					for (const id of deckIds) setCompact(appState.decks[id])
				}}>All compact</button
			>
		</menu>
	</section>

	{#each deckIds as id (id)}
		{@const deck = appState.decks[id]}
		{@const active = id === appState.active_deck_id}
		<section>
			<header>
				<h3>
					Deck {id}
					{#if active}<small>(active)</small>{/if}
					{#if deck.playlist_slug}<small>&middot; {deck.playlist_slug}</small>{/if}
				</h3>
				<menu>
					{#if !active}
						<button onclick={() => (appState.active_deck_id = id)}>Set active</button>
					{/if}
					<button class="danger" onclick={() => removeDeck(id)}>Remove</button>
				</menu>
			</header>

			<fieldset>
				<legend>Layout &middot; <strong>{layoutLabel(deck)}</strong></legend>

				<menu>
					<button disabled={layoutLabel(deck) === 'normal'} onclick={() => setNormal(deck)}>Normal</button>
					<button disabled={deck.compact} onclick={() => setCompact(deck)}>Compact</button>
					<button disabled={deck.expanded} onclick={() => setExpanded(deck)}>Expanded</button>
				</menu>

				<menu>
					<button onclick={() => toggleDeckCompact(id)}>Toggle compact</button>
					<button onclick={() => togglePlayerExpanded(id)}>Toggle expanded</button>
					<button onclick={() => toggleVideo(id)}>Toggle video</button>
					<button onclick={() => toggleQueuePanel(id)}>Toggle queue</button>
				</menu>

				<div>
					<label><input type="checkbox" bind:checked={deck.hide_video_player} /> hide_video_player</label>
					<label><input type="checkbox" bind:checked={deck.hide_queue_panel} /> hide_queue_panel</label>
					<label><input type="checkbox" bind:checked={deck.compact} /> compact</label>
					<label><input type="checkbox" bind:checked={deck.expanded} /> expanded</label>
				</div>
			</fieldset>

			<fieldset>
				<legend>Playback</legend>
				<div>
					<label><input type="checkbox" bind:checked={deck.is_playing} /> is_playing</label>
					<label><input type="checkbox" bind:checked={deck.shuffle} /> shuffle</label>
					<label><input type="checkbox" bind:checked={deck.muted} /> muted</label>
				</div>
				<div>
					<label>volume <InputRange bind:value={deck.volume} min={0} max={1} step={0.05} /></label>
					<label>speed <InputRange bind:value={deck.speed} min={0.25} max={3} step={0.25} /></label>
				</div>
			</fieldset>

			<details>
				<summary>State</summary>
				<dl class="meta">
					<dt>Channel</dt>
					<dd>
						<code>{deck.playlist_slug ?? 'none'}</code>
						{#if deck.playlist_title}&middot; {deck.playlist_title}{/if}
					</dd>

					<dt>Queue</dt>
					<dd>
						track: <code>{deck.playlist_track ?? 'none'}</code> &middot; tracks: {deck.playlist_tracks?.length ?? 0} &middot;
						shuffled: {deck.playlist_tracks_shuffled?.length ?? 0}
						{#if deck.queue_panel_width != null}&middot; panel width: {deck.queue_panel_width}px{/if}
					</dd>

					<dt>Timing</dt>
					<dd>
						played_at: <code>{deck.track_played_at ?? 'none'}</code> &middot; seeked_at:
						<code>{deck.seeked_at ?? 'none'}</code>
						&middot; seek_position: <code>{deck.seek_position ?? 'none'}</code>
					</dd>

					<dt>Broadcast</dt>
					<dd>
						broadcasting: <code>{deck.broadcasting_channel_id ?? 'none'}</code> &middot; listening:
						<code>{deck.listening_to_channel_id ?? 'none'}</code>
					</dd>
				</dl>
			</details>
		</section>
	{/each}

	{#if deckIds.length === 0}
		<p>No decks. Add one above.</p>
	{/if}
</div>
