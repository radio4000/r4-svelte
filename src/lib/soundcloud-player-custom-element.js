// SC Widget API: https://developers.soundcloud.com/docs/api/html5-widget
import {logger} from '$lib/logger'

const log = logger.ns('soundcloud-player').seal()
let soundcloudApiReadyPromise = null

/**
 * Minimal TimeRanges shim so media-chrome can read seekable/buffered ranges.
 * @param {number} start
 * @param {number} end
 */
function timeRanges(start, end) {
	return {
		length: end > start ? 1 : 0,
		start: () => start,
		end: () => end
	}
}

class SoundCloudPlayerElement extends HTMLElement {
	static observedAttributes = ['src', 'autoplay', 'controls', 'muted', 'playsinline']

	/** @type {any | null} */
	api = null

	isLoaded = false

	/** Use this to await the READY event from the SC Widget API. Call resolveLoad() once ready. */
	#loadComplete
	/** @type {function | null} */
	#resolveLoad = null

	#pendingVideoLoad = false

	/** @type {number | null} */
	#errorCode = null

	/** Cached values — SC Widget only exposes async callback getters, so we mirror state locally. */
	#cachedPaused = true
	#cachedVolume = 1
	#cachedMuted = false
	#cachedDuration = NaN
	#cachedCurrentTime = 0
	#lastDuration = NaN
	#metadataFired = false
	/** @type {ReturnType<typeof setInterval> | null} */
	#progressTimer = null

	constructor() {
		super()
		this.attachShadow({mode: 'open'})
		this.#loadComplete = new Promise((resolve) => {
			this.#resolveLoad = resolve
		})
	}

	async connectedCallback() {
		if (!this.shadowRoot) return

		// Create iframe with SoundCloud embed
		this.shadowRoot.innerHTML = `
			<style>
				:host { display: block; width: 100%; height: 200px; }
				iframe { width: 100%; height: 100%; }
			</style>
			<iframe id="player" frameborder="0" allow="autoplay"></iframe>
		`

		try {
			await this.loadSoundCloudAPI()
			await this.#initializePlayer()
		} catch (err) {
			log.error('Failed to initialize SoundCloud player:', err)
		}
	}

	disconnectedCallback() {
		this.#stopProgressTimer()
		if (this.api) {
			log.debug('disconnectedCallback: unbinding widget events')
			const events = globalThis.SC.Widget.Events
			this.api.unbind(events.READY)
			this.api.unbind(events.PLAY)
			this.api.unbind(events.PAUSE)
			this.api.unbind(events.FINISH)
			this.api.unbind(events.PLAY_PROGRESS)
			this.api.unbind(events.SEEK)
			this.api.unbind(events.ERROR)
		}
	}

	#stopProgressTimer() {
		if (this.#progressTimer) {
			clearInterval(this.#progressTimer)
			this.#progressTimer = null
		}
	}

	/**
	 * Poll position and duration from the widget — primary source for timeupdate,
	 * analogous to YouTube's onVideoProgress.
	 */
	#startProgressTimer() {
		if (this.#progressTimer) return
		this.#progressTimer = setInterval(() => {
			if (!this.api) return
			this.api.getPosition((ms) => {
				if (Number.isFinite(ms)) this.#cachedCurrentTime = ms / 1000
				this.dispatchEvent(new Event('timeupdate'))
			})
			this.api.getDuration((ms) => {
				this.#updateDuration(ms)
			})
		}, 250)
	}

	/** Update cached duration (ms from widget) and fire events when changed. */
	#updateDuration(ms) {
		if (!Number.isFinite(ms) || ms <= 0) return
		const sec = ms / 1000
		if (Math.abs(sec - this.#lastDuration) > 0.25) {
			this.#lastDuration = sec
			this.#cachedDuration = sec
			this.dispatchEvent(new Event('durationchange'))
			if (!this.#metadataFired) {
				this.#metadataFired = true
				this.dispatchEvent(new Event('loadedmetadata'))
			}
		}
	}

	async #initializePlayer() {
		log.debug('initializePlayer')
		// Guard against double init (connectedCallback + attributeChangedCallback race)
		if (this.api) return

		const iframe = this.shadowRoot?.querySelector('iframe')
		if (!iframe) return

		const initialSrc = this.getAttribute('src')
		if (!initialSrc) {
			log.debug('No src yet, skipping initialization')
			return
		}

		if (iframe && !iframe.src) {
			const trackUrl = this.getAttribute('src') || ''
			const autoplay = this.hasAttribute('autoplay') ? 'true' : 'false'
			iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}&auto_play=${autoplay}&visual=false&show_user=false&show_artwork=false`
		}

		try {
			this.api = globalThis.SC.Widget(iframe)

			this.api.bind(globalThis.SC.Widget.Events.READY, () => {
				this.isLoaded = true
				this.#resolveLoad?.()
				log.debug('ready')

				// Seed cached volume from widget state.
				this.api.getVolume((vol) => {
					const normalized = Number.isFinite(Number(vol)) ? Number(vol) / 100 : 1
					this.#cachedVolume = normalized
				})
				if (this.hasAttribute('muted')) this.#applyMuted(true)
				this.dispatchEvent(new Event('volumechange'))

				// Fetch initial duration.
				this.api.getDuration((ms) => this.#updateDuration(ms))

				if (this.#pendingVideoLoad) {
					log.debug('onReady calling loadTrack')
					this.#pendingVideoLoad = false
					this.#loadTrack()
				}
			})

			this.api.bind(globalThis.SC.Widget.Events.PLAY, () => {
				log.debug('PLAY event')
				this.#cachedPaused = false
				this.#startProgressTimer()
				this.dispatchEvent(new Event('play'))
				this.dispatchEvent(new Event('playing'))
			})

			this.api.bind(globalThis.SC.Widget.Events.PAUSE, () => {
				log.debug('PAUSE event')
				this.#cachedPaused = true
				this.#stopProgressTimer()
				this.dispatchEvent(new Event('timeupdate'))
				this.dispatchEvent(new Event('pause'))
			})

			this.api.bind(globalThis.SC.Widget.Events.FINISH, () => {
				log.debug('FINISH event')
				this.#cachedPaused = true
				this.#stopProgressTimer()
				this.dispatchEvent(new Event('timeupdate'))
				this.dispatchEvent(new Event('ended'))
			})

			this.api.bind(globalThis.SC.Widget.Events.PLAY_PROGRESS, (data) => {
				// Secondary: derive duration from relativePosition when getDuration lags.
				if (data.relativePosition > 0 && data.currentPosition > 0) {
					const derived = data.currentPosition / data.relativePosition
					this.#updateDuration(derived)
				}
			})

			this.api.bind(globalThis.SC.Widget.Events.SEEK, (data) => {
				this.#cachedCurrentTime = data.currentPosition / 1000
				this.dispatchEvent(new Event('timeupdate'))
				this.dispatchEvent(new Event('seeked'))
			})

			this.api.bind(globalThis.SC.Widget.Events.ERROR, (error) => {
				log.error('SoundCloud error:', error)
				this.#errorCode = error
				this.#stopProgressTimer()
				this.dispatchEvent(new Event('error'))
			})

			log.debug('SC.Widget created:', !!this.api)
		} catch (error) {
			log.error('Failed to create SC.Widget:', error)
		}
	}

	async attributeChangedCallback(attrName, oldValue, newValue) {
		if (attrName === 'src' && oldValue !== newValue && newValue) {
			log.debug('src changed to:', newValue)

			if (!this.api) {
				log.debug('Player not initialized yet, initializing now with src')
				try {
					await this.loadSoundCloudAPI()
					await this.#initializePlayer()
				} catch (err) {
					log.error('Failed to initialize SoundCloud player:', err)
				}
				return
			}

			if (this.isLoaded) {
				await this.#loadTrack()
			} else {
				log.debug('player not ready yet, marking as pending load')
				this.#pendingVideoLoad = true
			}
		}

		if (attrName === 'muted' && oldValue !== newValue) {
			this.#applyMuted(this.hasAttribute('muted'))
		}
	}

	async #loadTrack() {
		await this.#loadComplete
		const trackUrl = this.src
		log.debug('loadTrack', trackUrl)
		if (!trackUrl) return

		// Reset state for new track
		this.#errorCode = null
		this.#cachedDuration = NaN
		this.#lastDuration = NaN
		this.#cachedCurrentTime = 0
		this.#metadataFired = false
		this.#stopProgressTimer()

		// Fire durationchange to signal new media
		this.dispatchEvent(new Event('durationchange'))

		if (!this.api) return

		const options = {
			auto_play: this.hasAttribute('autoplay'),
			callback: () => {
				// Widget finished loading the new track — refresh duration and reapply volume.
				this.api.getDuration((ms) => this.#updateDuration(ms))
				if (this.#cachedMuted) {
					this.api.setVolume(0)
				} else if (this.api?.setVolume) {
					this.api.setVolume(this.#cachedVolume * 100)
				}
				this.dispatchEvent(new Event('volumechange'))
			}
		}
		this.api.load(trackUrl, options)
	}

	async play() {
		log.debug('play')
		await this.#loadComplete
		if (!this.api) return
		this.api.play()
	}

	async pause() {
		await this.#loadComplete
		if (this.api) {
			this.api.pause()
		}
	}

	get paused() {
		return this.#cachedPaused
	}

	get currentTime() {
		return this.#cachedCurrentTime
	}

	set currentTime(val) {
		if (this.currentTime === val) return
		// Update cache immediately so media-chrome reads the new value right away.
		this.#cachedCurrentTime = val
		this.#loadComplete.then(() => {
			this.api?.seekTo(val * 1000)
		})
	}

	get duration() {
		return this.#cachedDuration
	}

	/** media-chrome reads seekable to determine if the time range is interactive. */
	get seekable() {
		const d = this.#cachedDuration
		return timeRanges(0, Number.isFinite(d) ? d : 0)
	}

	/** media-chrome reads buffered for the progress indicator. */
	get buffered() {
		const d = this.#cachedDuration
		return timeRanges(0, Number.isFinite(d) ? d : 0)
	}

	get readyState() {
		// 0 = HAVE_NOTHING, 1 = HAVE_METADATA, 4 = HAVE_ENOUGH_DATA
		if (!this.isLoaded) return 0
		if (Number.isFinite(this.#cachedDuration)) return 4
		return 1
	}

	get error() {
		return this.#errorCode
	}

	get volume() {
		return this.#cachedVolume
	}

	set volume(val) {
		if (this.volume === val) return
		this.#cachedVolume = val
		this.#loadComplete.then(() => {
			log.debug('setting volume to:', val)
			if (this.api?.setVolume) {
				this.api.setVolume(this.#cachedMuted ? 0 : val * 100)
			}
			this.dispatchEvent(new Event('volumechange'))
		})
	}

	get muted() {
		return this.#cachedMuted
	}

	set muted(val) {
		this.#applyMuted(Boolean(val))
	}

	/** Internal mute handler — avoids re-entrant attributeChangedCallback loops. */
	#applyMuted(val) {
		if (this.#cachedMuted === val) return
		this.#cachedMuted = val
		this.#loadComplete.then(() => {
			log.debug('setting muted to:', val)
			if (this.api?.setVolume) {
				this.api.setVolume(val ? 0 : this.#cachedVolume * 100)
			}
			this.dispatchEvent(new Event('volumechange'))
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

	loadSoundCloudAPI() {
		log.debug('loadSoundCloudAPI')

		if (globalThis.SC?.Widget) {
			log.debug('loadSoundCloudAPI resolving with existing global SC.Widget instance')
			return Promise.resolve(globalThis.SC)
		}

		if (!soundcloudApiReadyPromise) {
			soundcloudApiReadyPromise = new Promise((resolve, reject) => {
				const existing = /** @type {HTMLScriptElement | null} */ (
					document.querySelector('script[src*="soundcloud.com/player/api.js"]')
				)
				const script = existing ?? document.createElement('script')
				if (!existing) {
					script.src = 'https://w.soundcloud.com/player/api.js'
					script.async = true
					document.head.appendChild(script)
					log.debug('SoundCloud API script added')
				}

				const timeout = setTimeout(() => {
					clearInterval(poll)
					reject(new Error('SoundCloud API load timeout'))
				}, 12000)

				const poll = setInterval(() => {
					if (globalThis.SC?.Widget) {
						clearInterval(poll)
						clearTimeout(timeout)
						resolve(globalThis.SC)
					}
				}, 200)

				script.addEventListener(
					'load',
					() => {
						if (globalThis.SC?.Widget) {
							clearInterval(poll)
							clearTimeout(timeout)
							resolve(globalThis.SC)
						}
					},
					{once: true}
				)
			}).catch((err) => {
				soundcloudApiReadyPromise = null
				throw err
			})
		}
		return soundcloudApiReadyPromise
	}
}

if (!customElements.get('soundcloud-player')) {
	customElements.define('soundcloud-player', SoundCloudPlayerElement)
}

export default SoundCloudPlayerElement
