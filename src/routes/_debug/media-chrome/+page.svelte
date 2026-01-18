<script>
	import 'media-chrome'
	import '$lib/youtube-video-custom-element.js'
	import '$lib/soundcloud-player-custom-element.js'
	import {detectMediaProvider} from '$lib/utils.ts'

	const testUrls = [
		{
			title: 'YouTube - Ambient',
			url: 'https://www.youtube.com/watch?v=CWRQIorgdTE'
		},
		{
			title: 'YouTube - Jazz',
			url: 'https://www.youtube.com/watch?v=vmDDOFXSgAs'
		},
		{
			title: 'SoundCloud - Test Pressing',
			url: 'https://soundcloud.com/user-612196404/test-pressing-w-jamie-tiller'
		},
		{
			title: 'SoundCloud - sw0rdes',
			url: 'https://soundcloud.com/sw0rdes/im-sorry-i-drank-all-of-ur-wine'
		}
	]

	let currentUrl = $state(testUrls[0].url)
	let autoplay = $state(true)
	let userHasPlayed = $state(false)

	let youtubePlayer = $state()
	let soundcloudPlayer = $state()

	let trackType = $derived(detectMediaProvider(currentUrl))
	let mediaElement = $derived(trackType === 'youtube' ? youtubePlayer : soundcloudPlayer)

	let paused = $state(true)
	let currentTime = $state(0)
	let duration = $state(0)
	let volume = $state(1)

	function selectTrack(url) {
		currentUrl = url
		userHasPlayed = true
	}

	function handlePlay() {
		console.log('▶️ play')
		userHasPlayed = true
		paused = false
	}

	function handlePause() {
		console.log('⏸️ pause')
		paused = true
	}

	function handleTimeUpdate() {
		if (mediaElement) {
			currentTime = mediaElement.currentTime
			duration = mediaElement.duration || 0
		}
	}

	function handleDurationChange() {
		console.log('⏱️ durationchange')
		if (mediaElement) {
			duration = mediaElement.duration || 0
		}
	}

	function handleError(event) {
		console.error('❌ error', event.target?.error)
	}

	function handleEnded() {
		console.log('⏹️ ended')
		paused = true
	}

	async function testTogglePlay() {
		if (!mediaElement) return
		if (mediaElement.paused) {
			await mediaElement.play()
		} else {
			await mediaElement.pause()
		}
	}

	async function seekToStart() {
		if (mediaElement) mediaElement.currentTime = 0
	}

	async function seekTo30() {
		if (mediaElement) mediaElement.currentTime = 30
	}

	async function setVolume(val) {
		if (mediaElement) mediaElement.volume = val
	}

	async function setMuted(val) {
		if (mediaElement) mediaElement.muted = val
	}
</script>

<div class="constrained">
	<menu data-grouped>
		<a href="/_debug">&larr;</a>
	</menu>
	<h1>Media Chrome</h1>
	<p>Tests media-chrome with YouTube and SoundCloud custom elements.</p>

	<section>
		<h2>Test URLs</h2>
		<menu>
			{#each testUrls as test (test.url)}
				<button onclick={() => selectTrack(test.url)} class:active={currentUrl === test.url}>
					{test.title}
				</button>
			{/each}
		</menu>
		<label>
			<input type="checkbox" bind:checked={autoplay} />
			Autoplay
		</label>
	</section>

	<section>
		<h2>Manual controls</h2>
		<menu>
			<button onclick={testTogglePlay}>Toggle (JS)</button>
			<button onclick={seekToStart}>Seek 0</button>
			<button onclick={seekTo30}>Seek 30</button>
			<button onclick={() => setVolume(0.5)}>Vol 50%</button>
			<button onclick={() => setVolume(1)}>Vol 100%</button>
			<button onclick={() => setMuted(true)}>Mute</button>
			<button onclick={() => setMuted(false)}>Unmute</button>
		</menu>
	</section>

	<section>
		<h2>Current state</h2>
		<dl class="meta">
			<dt>URL</dt>
			<dd><code>{currentUrl}</code></dd>
			<dt>Provider</dt>
			<dd>{trackType}</dd>
			<dt>User played</dt>
			<dd>{userHasPlayed}</dd>
			<dt>Autoplay</dt>
			<dd>{autoplay}</dd>
			<dt>Paused</dt>
			<dd>{paused}</dd>
			<dt>Current time</dt>
			<dd>{currentTime.toFixed(2)}s</dd>
			<dt>Duration</dt>
			<dd>{duration.toFixed(2)}s</dd>
			<dt>Volume</dt>
			<dd>{volume.toFixed(2)}</dd>
		</dl>
	</section>

	<section>
		<h2>Player</h2>
		<media-controller>
			{#if trackType === 'youtube'}
				<youtube-video
					slot="media"
					bind:this={youtubePlayer}
					src={currentUrl}
					autoplay={(autoplay && userHasPlayed) || undefined}
					onplay={handlePlay}
					onpause={handlePause}
					onended={handleEnded}
					onerror={handleError}
					ontimeupdate={handleTimeUpdate}
					ondurationchange={handleDurationChange}
				></youtube-video>
			{:else if trackType === 'soundcloud'}
				<soundcloud-player
					slot="media"
					bind:this={soundcloudPlayer}
					src={currentUrl}
					autoplay={(autoplay && userHasPlayed) || undefined}
					onplay={handlePlay}
					onpause={handlePause}
					onended={handleEnded}
					onerror={handleError}
					ontimeupdate={handleTimeUpdate}
					ondurationchange={handleDurationChange}
				></soundcloud-player>
			{/if}
			<media-loading-indicator slot="centered-chrome"></media-loading-indicator>

			<media-control-bar>
				<media-play-button></media-play-button>
				<media-seek-backward-button></media-seek-backward-button>
				<media-seek-forward-button></media-seek-forward-button>
				<media-time-range></media-time-range>
				<media-time-display showduration></media-time-display>
				<media-mute-button></media-mute-button>
				<media-volume-range></media-volume-range>
			</media-control-bar>
		</media-controller>
	</section>
</div>

<style>
	section {
		margin-block-start: 2rem;
	}
</style>
