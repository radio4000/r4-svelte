// Copied from https://github.com/oskarrough/rough-spinner

class Spinner extends HTMLElement {
	/** @type {number | ReturnType<typeof setInterval> | undefined} */
	timer

	static get observedAttributes() {
		return ['spinner']
	}

	connectedCallback() {
		// If we don't delay `this.textContent` can be undefined.
		requestAnimationFrame(() => {
			this.startSpinner(this.spinner)
		})
	}

	attributeChangedCallback(name, oldValue, newValue) {
		if (name === 'spinner' && oldValue && newValue) {
			clearInterval(this.timer)
			this.startSpinner(this.spinner)
		}
	}

	get interval() {
		return Number(this.getAttribute('interval')) || 500
	}

	set interval(val) {
		this.setAttribute('interval', String(val))
	}

	get spinners() {
		return [
			'',
			'←↖↑↗→↘↓↙',
			'▁▃▄▅▆▇█▇▆▅▄▃',
			'▉▊▋▌▍▎▏▎▍▌▋▊▉',
			'▖▘▝▗',
			'┤┘┴└├┌┬┐',
			'◢◣◤◥',
			'◰◳◲◱',
			'◴◷◶◵',
			'◐◓◑◒',
			'|/-\\',
			'.oO@*',
			['◡◡', '◠◠'],
			'⣾⣽⣻⢿⡿⣟⣯⣷',
			'⠁⠂⠄⡀⢀⠠⠐⠈',
			[`>))'>`, ` >))'>`, `  >))'>`, `   >))'>`, `    >))'>`, `   <'((<`, `  <'((<`, ` <'((<`]
		]
	}

	get spinner() {
		const i = this.getAttribute('spinner')

		if (this.textContent) {
			return this.textContent
		}

		if (i === null) {
			return this.spinners[1]
		}

		return this.spinners[i] || this.spinners[1]
	}

	set spinner(val) {
		this.setAttribute('spinner', val)
	}

	/** @param {string | string[]} spinner */
	startSpinner(spinner) {
		let i = 0

		const fps = this.getAttribute('fps')

		if (fps) {
			const step = () => {
				setTimeout(
					() => {
						this.innerHTML = spinner[i]
						i = (i + 1) % spinner.length
						this.timer = requestAnimationFrame(step)
					},
					1000 / Number(fps)
				)
			}
			this.timer = requestAnimationFrame(step)
		} else {
			this.timer = setInterval(() => {
				this.innerHTML = spinner[i]
				i = (i + 1) % spinner.length
			}, this.interval)
		}
	}

	disconnectedCallback() {
		if (this.timer != null) {
			cancelAnimationFrame(/** @type {number} */ (this.timer))
			clearInterval(this.timer)
		}
	}
}

customElements.define('rough-spinner', Spinner)
