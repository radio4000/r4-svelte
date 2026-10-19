import {logger} from '#lib/logger.js'
import {upgradeProperties} from '#lib/custom-element-props.js'

const log = logger.ns('youtube-video').seal()
const YOUTUBE_IFRAME_ALLOW =
	'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'

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
	/** Track switches (docs/player.md, "Auto-advance on a locked screen"). From a src change
	 *  until the new video plays: play() is a no-op (loadVideoById autoplays; a racing
	 *  playVideo() restarted the old, ended video or re-cued the new one), and the PAUSED that
	 *  loadVideoById reports is ignored (it flipped the deck and OS media session to paused). */
	#switchStartedAt = 0
	/** Defensive: shortly after a switch, while hidden, resume a pause we didn't ask for. */
	#landingUntil = 0
	#landingResumes = 0
	#pauseRequested = false
	/** Expires, so a load that never starts can't swallow a later play() or pause. */
	get #switching() {
		return Date.now() - this.#switchStartedAt < 5000
	}
	/** Defensive: the mute state we asked for. A mute YouTube applies on its own is never
	 *  reported as the listener's volume change, and ours is restored once visible (unmuting
	 *  while hidden made the browser pause the video). */
	#mutedIntent = false
	#onVisibilityChange = () => this.#restoreMute()

	/** @type {YT.PlayerError | null} */
	#errorCode = null
	#lastDuration = NaN

	constructor() {
		super()
		this.#loadComplete = new Promise((resolve) => {
			this.#resolveLoad = resolve
		})
	}

	async connectedCallback() {
		// Must run before anything else — see custom-element-props.js.
		upgradeProperties(this, ['src', 'volume', 'muted', 'playbackRate', 'currentTime'])
		document.addEventListener('visibilitychange', this.#onVisibilityChange)

		// Use light DOM for better fullscreen compatibility in embedded YouTube controls.
		this.style.display = 'block'
		this.style.width = '100%'
		this.style.height = '100%'

		if (!this.querySelector('iframe#player')) {
			const iframe = document.createElement('iframe')
			iframe.id = 'player'
			iframe.frameBorder = '0'
			this.#applyIframePermissions(iframe)
			iframe.style.width = '100%'
			iframe.style.height = '100%'
			this.replaceChildren(iframe)
		}

		try {
			await this.loadYouTubeAPI()
			await this.#initializePlayer()
		} catch (err) {
			log.error('Failed to initialize YouTube player:', err)
		}
	}

	disconnectedCallback() {
		document.removeEventListener('visibilitychange', this.#onVisibilityChange)
		// Destroy player to clean up listeners and prevent memory leaks
		if (this.api) {
			log.debug('disconnectedCallback: destroying player')
			this.api.destroy()
			this.api = null
		}
	}

	async #initializePlayer() {
		log.debug('initializePlayer')
		const iframe = this.querySelector('iframe')

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
		if (this.hasAttribute('muted')) this.#mutedIntent = true

		try {
			// @ts-expect-error iframe may be null/undefined at type-check time but is guaranteed present here
			this.api = new globalThis.YT.Player(iframe, {
				width: '100%',
				height: '100%',
				playerVars: {
					controls: this.hasAttribute('controls') ? 1 : 0,
					fs: 1,
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
					onReady: (event) => {
						this.isLoaded = true
						this.#applyIframePermissions(event?.target?.getIframe?.())
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
						this.#switchStartedAt = 0
						this.#errorCode = error.data
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
				this.#maybeDispatchDurationChange()
				// log.debug('onVideoProgress fired, dispatching timeupdate')
				this.dispatchEvent(new Event('timeupdate'))
			})

			// @ts-expect-error onVolumeChange is undocumented but works
			this.api.addEventListener('onVolumeChange', () => {
				if (this.#restoreMute()) return
				log.debug('onVolumeChange fired, dispatching volumechange')
				this.dispatchEvent(new Event('volumechange'))
			})
		} catch (error) {
			log.error('Failed to create YT.Player:', error)
		}
	}

	/**
	 * The YT API keeps reporting the previous video's data between loadVideoById
	 * and the new video's metadata arriving — treat that window as "no duration".
	 */
	#isSwitchingVideo() {
		const srcId = this.#extractVideoId(this.src)
		const loadedId = this.api?.getVideoData?.()?.video_id
		return Boolean(srcId && srcId !== loadedId)
	}

	#maybeDispatchDurationChange() {
		const duration = this.duration
		if (
			Number.isFinite(duration) &&
			duration > 0 &&
			(!Number.isFinite(this.#lastDuration) || Math.abs(duration - this.#lastDuration) > 0.25)
		) {
			this.#lastDuration = duration
			this.dispatchEvent(new Event('durationchange'))
		}
	}

	#dispatchStateEvents(state) {
		const YT = globalThis.YT
		if (state === YT.PlayerState.PAUSED && this.#switching) {
			log.debug('ignoring pause while switching videos')
			return
		}
		if (state !== YT.PlayerState.UNSTARTED && state !== YT.PlayerState.BUFFERING) {
			this.#switchStartedAt = 0
		}
		if (state === YT.PlayerState.PLAYING) {
			this.#restoreMute()
			this.#maybeDispatchDurationChange()
			this.dispatchEvent(new Event('play'))
			this.dispatchEvent(new Event('playing'))
		} else if (state === YT.PlayerState.PAUSED) {
			if (
				document.visibilityState === 'hidden' &&
				!this.#pauseRequested &&
				Date.now() < this.#landingUntil &&
				this.#landingResumes < 3
			) {
				this.#landingResumes++
				log.warn('paused right after a switch while hidden, resuming', this.#landingResumes)
				this.api?.playVideo()
				return
			}
			this.dispatchEvent(new Event('pause'))
		} else if (state === YT.PlayerState.ENDED) {
			this.dispatchEvent(new Event('ended'))
		} else if (state === YT.PlayerState.CUED) {
			// Cued videos never fire onVideoProgress, so propagate duration here
			this.#maybeDispatchDurationChange()
			if (this.hasAttribute('autoplay') && !this.#autoplayAttempted) {
				// If video is cued and autoplay is enabled, start playing (only once per video)
				log.debug('video cued with autoplay, calling playVideo()')
				this.#autoplayAttempted = true
				this.api?.playVideo()
			}
		}
	}

	async attributeChangedCallback(attrName, oldValue, newValue) {
		if (attrName === 'src' && oldValue !== newValue && newValue) {
			log.debug('src changed to:', newValue)
			// Mark the switch now: a play() racing ahead of #loadVideo must not playVideo() the
			// old, ended video (that restarts it, then reports a pause mid-switch).
			if (this.isLoaded && this.hasAttribute('autoplay')) this.#switchStartedAt = Date.now()
			this.#landingUntil = Date.now() + 10000
			this.#landingResumes = 0
			this.#pauseRequested = false
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
			this.#switchStartedAt = Date.now()
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
		this.#pauseRequested = false
		await this.#loadComplete
		if (!this.api) return
		// loadVideoById already autoplays; cueing or playVideo() on top would fight it.
		if (this.#switching) {
			log.debug('play: load in progress, it autoplays')
			return
		}

		// If video is in unstarted state (-1), try to cue it first
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
		this.#switchStartedAt = 0
		this.#pauseRequested = true
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
		if (this.#isSwitchingVideo()) return 0
		return this.api?.getCurrentTime?.() ?? 0
	}

	set currentTime(val) {
		if (this.currentTime === val) return
		this.#loadComplete.then(() => {
			this.api?.seekTo(val, true)
		})
	}

	get duration() {
		if (this.#isSwitchingVideo()) return NaN
		return this.api?.getDuration?.() ?? NaN
	}

	get readyState() {
		// 0 = HAVE_NOTHING, 1 = HAVE_METADATA, 4 = HAVE_ENOUGH_DATA
		if (!this.isLoaded || this.#isSwitchingVideo()) return 0
		if (Number.isFinite(this.duration) && this.duration > 0) return 4
		return 1
	}

	get error() {
		return this.#errorCode
	}

	get volume() {
		if (!this.api?.getVolume) return 1
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
		if (!this.api?.isMuted) return false
		return this.api.isMuted()
	}

	/** Undo a mute we didn't ask for, once visible. True when the mute isn't ours. */
	#restoreMute() {
		if (!this.api?.isMuted || this.api.isMuted() === this.#mutedIntent) return false
		if (document.visibilityState !== 'visible') return true
		log.info('provider changed mute on its own, restoring', {muted: this.#mutedIntent})
		if (this.#mutedIntent) this.api.mute()
		else this.api.unMute()
		return true
	}

	set muted(val) {
		this.#mutedIntent = Boolean(val)
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

	#applyIframePermissions(iframe) {
		if (!(iframe instanceof HTMLIFrameElement)) return
		iframe.style.display = 'block'
		iframe.style.width = '100%'
		iframe.style.height = '100%'
		iframe.style.maxHeight = 'none'
		iframe.removeAttribute('width')
		iframe.removeAttribute('height')
		iframe.setAttribute('allowfullscreen', '')
		iframe.allowFullscreen = true
		iframe.setAttribute('allow', YOUTUBE_IFRAME_ALLOW)
		iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
	}
}

if (!customElements.get('youtube-video')) {
	customElements.define('youtube-video', YouTube2Element)
}

export default YouTube2Element
