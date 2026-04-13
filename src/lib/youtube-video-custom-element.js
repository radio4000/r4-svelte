import {logger} from '$lib/logger'

const log = logger.ns('youtube-video').seal()

/** You always think this isn't so complicated, but it is. We did this player so many times. Last attempt to not write it was using the `<youtube-video>` element from the media-chrome project. But that also failed since it doesn't do the extra tricks needed to ensure playback */
class YouTube2Element extends HTMLElement {
	static observedAttributes = ['src', 'autoplay', 'controls', 'muted', 'playsinline']

	/** @type {YT.Player | null} */
	api = null

	isLoaded = false

	/** Use this to await the `onReady` event from the YT API. Call `resolveLoad()` once ready. */
	#loadComplete
	/** @type {function | null} */
	#resolveLoad = null

	#pendingVideoLoad = false
	#autoplayAttempted = false

	/** @type {YT.PlayerError | null} */
	#errorCode = null
	#lastDuration = NaN

	constructor() {
		super()
		this.attachShadow({mode: 'open'})
		this.#loadComplete = new Promise((resolve) => {
			this.#resolveLoad = resolve
		})
	}

	async connectedCallback() {
		if (!this.shadowRoot) return

		// Create iframe with proper YouTube embed params
		this.shadowRoot.innerHTML = `
			<style>
				:host { display: block; width: 100%; height: 200px; }
				iframe { width: 100%; height: 100%; }
			</style>
			<iframe
				id="player"
				frameborder="0"
				allowfullscreen
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
			></iframe>
		`

		try {
			await this.loadYouTubeAPI()
			await this.#initializePlayer()
		} catch (err) {
			log.error('Failed to initialize YouTube player:', err)
		}
	}

	disconnectedCallback() {
		// Destroy player to clean up listeners and prevent memory leaks
		if (this.api) {
			log.debug('disconnectedCallback: destroying player')
			this.api.destroy()
			this.api = null
		}
	}

	async #initializePlayer() {
		log.debug('initializePlayer')
		const iframe = this.shadowRoot?.querySelector('iframe')

		if (iframe && !iframe.src) {
			const src = this.getAttribute('src')
			if (!src) {
				log.debug('No src provided, skipping initialization')
				return
			}
			const videoId = this.#extractVideoId(src)
			if (!videoId) {
				log.error('Invalid YouTube URL:', src)
				return
			}
			iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`
		}

		try {
			// @ts-expect-error iframe may be null/undefined at type-check time but is guaranteed present here
			this.api = new globalThis.YT.Player(iframe, {
				playerVars: {
					controls: this.hasAttribute('controls') ? 1 : 0,
					autoplay: this.hasAttribute('autoplay') ? 1 : 0,
					mute: this.hasAttribute('muted') ? 1 : 0,
					playsinline: this.hasAttribute('playsinline') ? 1 : 0,
					enablejsapi: 1,
					origin: window.location.origin,
					rel: 0, // Don't show related videos
					iv_load_policy: 3, // Hide annotations
					modestbranding: 1, // Minimal YouTube branding
					showinfo: 0 // Hide video info (deprecated but kept for older embeds)
				},
				events: {
					onReady: () => {
						this.isLoaded = true
						this.#resolveLoad?.()
						log.debug('ready')

						// Load video if src is already set or was pending
						if (this.src || this.#pendingVideoLoad) {
							log.debug('onReady calling loadVideo')
							this.#pendingVideoLoad = false
							this.#loadVideo()
						}
					},
					onStateChange: (event) => {
						log.debug('state change:', event.data)
						this.#dispatchStateEvents(event.data)
					},
					onError: (error) => {
						log.error('YouTube error:', error.data)
						this.#errorCode = error.data
						// Fire durationchange to reset UI on error
						// this.dispatchEvent(new Event('durationchange'))
						// this.#ready.reject(new Error(`YouTube error: ${error.data}`))
						this.dispatchEvent(new Event('error'))
					},
					onAutoplayBlocked: (notsure) => {
						log.info('browser blocked autoplay', notsure)
					}
				}
			})
			log.debug('YT.Player created:', !!this.api)

			// @ts-expect-error onVideoProgress is undocumented but works
			this.api.addEventListener('onVideoProgress', () => {
				const duration = this.api?.getDuration?.() ?? NaN
				if (
					Number.isFinite(duration) &&
					duration > 0 &&
					Math.abs(duration - this.#lastDuration) > 0.25
				) {
					this.#lastDuration = duration
					this.dispatchEvent(new Event('durationchange'))
				}
				// log.debug('onVideoProgress fired, dispatching timeupdate')
				this.dispatchEvent(new Event('timeupdate'))
			})

			// @ts-expect-error onVolumeChange is undocumented but works
			this.api.addEventListener('onVolumeChange', () => {
				log.debug('onVolumeChange fired, dispatching volumechange')
				this.dispatchEvent(new Event('volumechange'))
			})
		} catch (error) {
			log.error('Failed to create YT.Player:', error)
		}
	}

	#dispatchStateEvents(state) {
		const YT = globalThis.YT
		if (state === YT.PlayerState.PLAYING) {
			this.dispatchEvent(new Event('play'))
			this.dispatchEvent(new Event('playing'))
		} else if (state === YT.PlayerState.PAUSED) {
			this.dispatchEvent(new Event('pause'))
		} else if (state === YT.PlayerState.ENDED) {
			this.dispatchEvent(new Event('ended'))
		} else if (
			state === YT.PlayerState.CUED &&
			this.hasAttribute('autoplay') &&
			!this.#autoplayAttempted
		) {
			// If video is cued and autoplay is enabled, start playing (only once per video)
			log.debug('video cued with autoplay, calling playVideo()')
			this.#autoplayAttempted = true
			this.api?.playVideo()
		}
	}

	async attributeChangedCallback(attrName, oldValue, newValue) {
		if (attrName === 'src' && oldValue !== newValue && newValue) {
			log.debug('src changed to:', newValue)
			if (this.isLoaded) {
				await this.#loadVideo()
			} else {
				log.debug('player not ready yet, marking as pending load')
				this.#pendingVideoLoad = true
			}
		}
	}

	async #loadVideo() {
		await this.#loadComplete
		const videoId = this.#extractVideoId(this.src)
		log.debug('loadVideo', videoId)
		if (!videoId) return

		// Reset state for new video
		this.#autoplayAttempted = false
		this.#errorCode = null
		this.#lastDuration = NaN

		// Fire durationchange to signal new media
		this.dispatchEvent(new Event('durationchange'))

		if (!this.api) return
		if (this.hasAttribute('autoplay')) {
			this.api.loadVideoById(videoId)
		} else {
			this.api.cueVideoById(videoId)
		}
	}

	static #RE_VIDEO_ID =
		/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&\n?#]+)/

	#extractVideoId(url) {
		if (!url) return null
		const match = url.match(YouTube2Element.#RE_VIDEO_ID)
		return match?.[1] || null
	}

	async play() {
		log.debug('play')
		await this.#loadComplete
		if (!this.api) return

		// If video is in unstarted state (-1), try to cue it first
		//
		const state = this.api.getPlayerState()
		if (state === -1 && this.src) {
			const videoId = this.#extractVideoId(this.src)
			if (videoId) {
				log.debug('video unstarted, cueing first')
				this.api.cueVideoById(videoId)
				// Small delay to let it cue
				await new Promise((resolve) => setTimeout(resolve, 100))
			}
		}

		this.api.playVideo()
	}

	async pause() {
		await this.#loadComplete
		if (this.api) {
			this.api.pauseVideo()
		}
	}

	get paused() {
		if (!this.isLoaded) return true
		const state = this.api?.getPlayerState?.()
		return state !== globalThis.YT?.PlayerState.PLAYING
	}

	get currentTime() {
		return this.api?.getCurrentTime?.() ?? 0
	}

	set currentTime(val) {
		if (this.currentTime === val) return
		this.#loadComplete.then(() => {
			this.api?.seekTo(val, true)

			// why this?
			// if (this.paused) {
			// 	this.#seekComplete?.then(() => {
			// 		if (!this.#seekComplete) return
			// 		this.api?.pauseVideo()
			// 	})
			// }
		})
	}

	get duration() {
		return this.api?.getDuration?.() ?? NaN
	}

	get error() {
		return this.#errorCode
	}

	get volume() {
		if (!this.api || !this.api.getVolume) return 1
		return this.api.getVolume() / 100
	}

	set volume(val) {
		// Don't check equality if API isn't ready
		if (this.api?.getVolume && this.volume === val) return
		this.#loadComplete.then(() => {
			log.debug('setting volume to:', val)
			if (this.api?.setVolume) {
				this.api.setVolume(val * 100)
			}
		})
	}

	get muted() {
		if (!this.api || !this.api.isMuted) return false
		return this.api.isMuted()
	}

	set muted(val) {
		// Don't check equality if API isn't ready
		if (this.api?.isMuted && this.muted === val) return
		this.#loadComplete.then(() => {
			log.debug('setting muted to:', val)
			if (val && this.api?.mute) {
				this.api.mute()
			} else if (!val && this.api?.unMute) {
				this.api.unMute()
			}
		})
	}

	get playbackRate() {
		return this.api?.getPlaybackRate?.() ?? 1
	}

	set playbackRate(val) {
		this.#loadComplete.then(() => {
			log.debug('setting playbackRate to:', val)
			this.api?.setPlaybackRate?.(val)
		})
	}

	get src() {
		return this.getAttribute('src')
	}

	set src(value) {
		if (value) {
			this.setAttribute('src', value)
		} else {
			this.removeAttribute('src')
		}
	}

	loadYouTubeAPI() {
		log.debug('loadYouTubeAPI')

		if (globalThis.YT?.Player) {
			log.debug('loadYouTubeAPI resolving with existing global YT.Player instance')
			return new Promise((resolve) => resolve(globalThis.YT))
		}

		const previous = globalThis.onYouTubeIframeAPIReady

		return new Promise((resolve) => {
			globalThis.onYouTubeIframeAPIReady = () => {
				if (previous) {
					previous()
				}
				log.debug('YouTube API loaded')
				resolve(globalThis.YT)
			}

			this.#loadScript()
		})
	}

	#loadScript() {
		if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
			const script = document.createElement('script')
			script.src = 'https://www.youtube.com/iframe_api'
			document.head.appendChild(script)
			log.debug('YouTube API script added')
		} else {
			log.debug('YouTube API script already exists')
		}
	}
}

if (!customElements.get('youtube-video')) {
	customElements.define('youtube-video', YouTube2Element)
}

export default YouTube2Element
