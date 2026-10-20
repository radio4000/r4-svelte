<script>
	import gsap from 'gsap'
	import {playChannel, toggleChannelPlay} from '#lib/api.js'
	import {appState} from '#lib/app-state.svelte.js'
	import {isChannelPlaying} from '#lib/deck.js'
	import {joinBroadcast} from '#lib/broadcast.js'
	import {broadcastsCollection} from '#lib/collections/broadcasts.js'
	import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
	import {channelImageUrl} from '#lib/utils.js'
	import ChannelCard from './channel-card.svelte'
	import Icon from './icon.svelte'
	import InputRange from './input-range.svelte'
	import * as m from '#lib/paraglide/messages.js'

	const {channels = []} = $props()

	let index = $state(0)
	let autoplay = $state(false)
	/** @type {ReturnType<typeof setTimeout> | null} */
	let playDebounce = null
	const channel = $derived(channels[index] ?? null)

	// Which way the slideshow should slide — set by whatever navigated, read
	// once by the effect below when it actually animates the change.
	let navDirection = 1

	function prev() {
		navDirection = -1
		index = (index - 1 + channels.length) % channels.length
		if (autoplay) play()
	}

	function next() {
		navDirection = 1
		index = (index + 1) % channels.length
		if (autoplay) play()
	}

	function play() {
		if (!channel) return
		playChannel(appState.active_deck_id, channel)
	}

	// What's actually rendered — deliberately a beat behind `channel` so the
	// GSAP timeline below can animate the old one out before swapping the art
	// and card underneath it and animating the new one in, instead of the DOM
	// just snapping to the new channel the instant `index` changes.
	// Raw: a deep $state would proxy the channel, so `next === displayed` below never
	// holds and every rerun replays the slide on the same channel.
	let displayed = $state.raw(/** @type {typeof channel} */ (null))
	let heroArt = $state(/** @type {HTMLElement | undefined} */ (undefined))
	let heroCard = $state(/** @type {HTMLElement | undefined} */ (undefined))
	/** @type {gsap.core.Timeline | null} */
	let tl = null

	// Without the classic card's image (and the play/pause it carried), there
	// was no way to play just the displayed channel outside autoplay — this is
	// that control, same tap-play semantics as ChannelCard's own image button.
	const broadcasts = useLiveQuery(broadcastsCollection)
	const isDisplayedBroadcasting = $derived(
		Boolean(displayed && broadcasts.data?.some((b) => b.channel_id === displayed.id))
	)
	const isDisplayedPlaying = $derived(
		Boolean(displayed && isChannelPlaying(appState.decks, displayed.slug))
	)
	let toggleLoading = $state(false)

	// Shown by default — toggles the info card off to leave just the art
	// visible. Visibility (not opacity/display) so it doesn't fight the GSAP
	// timeline's own opacity tween on the same element during transitions.
	let showCard = $state(true)

	async function toggleDisplayedPlay() {
		if (!displayed) return
		if (isDisplayedBroadcasting) {
			joinBroadcast(appState.active_deck_id, displayed.id)
			return
		}
		if (toggleLoading) return
		toggleLoading = true
		try {
			await toggleChannelPlay(displayed)
		} finally {
			toggleLoading = false
		}
	}

	// Slideshow-style: old slides out toward the direction of travel (scaling
	// down as it leaves), new slides in from the opposite side (scaling up to
	// rest) — fast, since this is an in-memory index change with nothing to
	// actually wait on, not a data fetch.
	const SLIDE = 90
	const SCALE_OFFSET = 0.82

	$effect(() => {
		const next = channel
		if (!heroArt || !heroCard || !displayed) {
			displayed = next
			return
		}
		if (next === displayed) return
		const dir = navDirection
		if (tl) tl.kill()
		tl = gsap.timeline()
		tl.to(heroArt, {
			opacity: 0,
			x: -dir * SLIDE,
			scale: SCALE_OFFSET,
			duration: 0.1,
			ease: 'power1.in'
		})
			.to(heroCard, {opacity: 0, x: -dir * SLIDE * 0.6, duration: 0.1, ease: 'power1.in'}, '<')
			.call(() => {
				displayed = next
			})
			.set(heroArt, {x: dir * SLIDE, scale: SCALE_OFFSET})
			.set(heroCard, {x: dir * SLIDE * 0.6})
			.to(heroArt, {opacity: 1, x: 0, scale: 1, duration: 0.2, ease: 'power2.out'})
			.to(heroCard, {opacity: 1, x: 0, duration: 0.2, ease: 'power2.out'}, '<')
	})
</script>

<div class="scanner">
	<div class="tuner-row">
		<button class="tuner-nav" onclick={prev} title={m.scanner_previous_channel()}>
			<Icon icon="previous-fill" />
		</button>

		<div class="station">
			{#if displayed}
				<div class="hero">
					{#if displayed.image}
						<div class="hero-art" bind:this={heroArt}>
							<img src={channelImageUrl(displayed.image)} alt="" loading="lazy" />
						</div>
					{/if}
					<div class="hero-card" class:card-hidden={!showCard} bind:this={heroCard}>
						<ChannelCard channel={displayed} />
					</div>
				</div>
			{/if}
		</div>

		<button class="tuner-nav" onclick={next} title={m.scanner_next_channel()}>
			<Icon icon="next-fill" />
		</button>
	</div>

	<menu>
		<button
			onclick={() => (showCard = !showCard)}
			class:active={showCard}
			title={m.scanner_toggle_info()}
		>
			<Icon icon="circle-info" />
		</button>
		<button
			onclick={toggleDisplayedPlay}
			disabled={!displayed}
			title={isDisplayedBroadcasting
				? m.channel_card_join_broadcast()
				: isDisplayedPlaying
					? m.common_pause()
					: m.common_play()}
		>
			<Icon icon={isDisplayedPlaying ? 'pause' : 'play-fill'} />
		</button>
		<button
			onclick={() => (autoplay = !autoplay)}
			class:active={autoplay}
			title={m.scanner_autoplay_navigation()}>{m.scanner_auto()}</button
		>
	</menu>

	<figure class="spectrum">
		{#each channels as ch, i (ch.id)}
			<button
				class="marker"
				class:tuned={i === index}
				style="left: {(i / (channels.length - 1)) * 100}%"
				title={ch.slug}
				onclick={() => {
					navDirection = i > index ? 1 : i < index ? -1 : navDirection
					index = i
				}}
			>
				<div
					class="marker-signal"
					style="height: {0.5 + Math.min(1, ((ch.track_count ?? 0) / 400) ** 0.8) * 3.5}rem"
				></div>
			</button>
		{/each}
	</figure>

	<InputRange
		bind:value={index}
		min={0}
		max={channels.length - 1}
		step={1}
		oninput={() => {
			if (!autoplay) return
			if (playDebounce) clearTimeout(playDebounce)
			playDebounce = setTimeout(play, 400)
		}}
	/>
</div>

<style>
	/* since this page doesn't have scroll we can hide it*/
	:global(.scroll-area:has(.scanner)) {
		scrollbar-gutter: auto;
	}

	/* <main> is the one link in the flex chain down to .scanner that's still
	   `min-height: auto` (correct for every other, naturally-scrolling page —
	   content should be free to exceed the viewport there). The scanner is the
	   one view that wants to be capped to the available height instead of
	   pushing the page taller, so it needs that default overridden here. */
	:global(main:has(.scanner)) {
		min-height: 0;
	}

	.scanner {
		--color: var(--gray-12);
		--color-active: var(--accent-7);

		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 100%;
		min-height: 0;
		padding-top: 1.5rem;

		background: linear-gradient(to right, var(--accent-3), transparent);
	}

	menu {
		margin-block-end: 1rem;
	}

	/* align-items stays at its default `stretch` — .station needs the row's
	   full height to give the card's percentage/container-query sizing below
	   something real to work with; centering here would shrink it to content
	   and collapse the whole card. */
	.tuner-row {
		display: flex;
		flex: 1;
		min-height: 0;
		width: 100%;
	}

	/* Prev/next flank the card like a radio tuner's dial arrows, instead of
	   sitting in the control row below with the other buttons. */
	.tuner-nav {
		flex: 0 0 auto;
		align-self: center;
		width: 3rem;
		height: 3rem;
		border-radius: 999px;
	}

	.spectrum {
		position: relative;
		height: 4rem;
		width: 100%;
		margin: 0;
		overflow: hidden;
	}

	.marker {
		position: absolute;
		bottom: 0;
		transform: translateX(-50%);
		padding: 0;
		border: none;
		background: transparent;
		display: flex;
		align-items: flex-end;
	}

	:global(.input-range) {
		background: var(--color);
	}

	.marker-signal {
		width: 2px;
		background: var(--color);
		min-height: 5px;
		transition:
			width 0.2s,
			background 0.2s;
	}

	.marker.tuned .marker-signal {
		background: var(--color-active);
		width: 10px;
		z-index: 2;
	}

	:global(.scanner > .input-range) {
		width: 100%;
		height: 40px;
	}

	/* container-type: size backs the cqi/cqb units below, so the art and card
	   scale with whatever space the row actually gives this station. */
	.station {
		display: flex;
		flex: 1;
		min-height: 0;
		width: 100%;
		padding: 1rem;
		place-content: center;
		align-items: center;
		overflow: hidden;
		container-type: size;
	}

	.hero {
		position: relative;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* The channel's actual image, full quality and its own aspect ratio (no
	   square crop, no blur) — sitting behind the card like album art in a CD
	   player, rather than a cropped/blurred backdrop. */
	.hero-art {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;

		img {
			max-width: 68cqi;
			max-height: 68cqb;
			width: auto;
			height: auto;
			object-fit: contain;
			border-radius: var(--border-radius);
			box-shadow:
				0 1.5rem 3rem rgb(0 0 0 / 30%),
				0 0 0 1px rgb(0 0 0 / 8%);
		}
	}

	/* The site's normal card, unchanged — just without its own figure, since
	   the channel image now lives in .hero-art behind it. */
	.hero-card {
		position: relative;
		z-index: 1;
		width: clamp(180px, 50cqi, 360px);

		:global(.card) {
			box-shadow: 0 1rem 2.5rem rgb(0 0 0 / 20%);
		}

		:global(.card figure) {
			display: none;
		}

		/* ChannelCard drops its background when playing — a nice subtle cue on
		   a plain page, but here the card sits over a photo, so losing its
		   backing would leave the text illegible against it. Keep the panel. */
		:global(.card.playing) {
			background: var(--color-interface-elevated);
			border-color: var(--color-interface-border);
		}
	}

	.hero-card.card-hidden {
		visibility: hidden;
		pointer-events: none;
	}
</style>
