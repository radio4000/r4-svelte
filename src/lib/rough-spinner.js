// Copied from https://github.com/oskarrough/rough-spinner

class Spinner extends HTMLElement {
	static get observedAttributes() {
		return ['spinner']
	}

	connectedCallback() {
		// If we don't delay `this.textContent` can be undefined.
		requestAnimationFrame(() => {
			this.timer = this.animate(this.spinner)
		})
	}

	attributeChangedCallback(name, oldValue, newValue) {
		if (name === 'spinner' && oldValue && newValue) {
			clearInterval(this.timer)
			this.timer = this.animate(this.spinner)
		}
	}

	get interval() {
		return this.getAttribute('interval') || 500
	}

	set interval(val) {
		this.setAttribute('interval', val)
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

		if (this.spinners[i]) {
			return this.spinners[i]
		}
	}

	set spinner(val) {
		this.setAttribute('spinner', val)
	}

	animate(spinner) {
		let i = 0
		const self = this

		const fps = this.getAttribute('fps')

		function repeatOften(timestamp) {
			if (fps) {
				setTimeout(() => {
					self.innerHTML = spinner[i]
					i = (i + 1) % spinner.length
					self.timer = requestAnimationFrame(repeatOften)
				}, 1000 / fps)
			} else {
				self.timer = setInterval(() => {
					self.innerHTML = spinner[i]
					i = (i + 1) % spinner.length
				}, self.interval)
			}
		}

		self.timer = requestAnimationFrame(repeatOften)
	}

	disconnectedCallback() {
		cancelAnimationFrame(this.timer)
	}
}

customElements.define('rough-spinner', Spinner)
