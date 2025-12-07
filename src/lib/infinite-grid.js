/**
 * Infinite grid engine for virtual scrolling
 */
export class InfiniteGrid {
	constructor(config = {}) {
		this.cellWidth = config.cellWidth || 180
		this.cellHeight = config.cellHeight || this.cellWidth * 2
		this.gap = config.gap || 20
		this.viewportBuffer = config.viewportBuffer || 4
		this.getContent = config.getContent || ((x, y) => `Cell (${x}, ${y})`)

		this.virtualPosition = {x: 0, y: 0}
		this.viewport = {width: 0, height: 0}
		this.gridDimensions = {cols: 0, rows: 0}
	}

	get spacingX() {
		return this.cellWidth + this.gap
	}

	get spacingY() {
		return this.cellHeight + this.gap
	}

	updateViewport(width, height) {
		this.viewport.width = width
		this.viewport.height = height
		this.gridDimensions.cols = Math.ceil(width / this.cellWidth) + this.viewportBuffer
		this.gridDimensions.rows = Math.ceil(height / this.cellHeight) + this.viewportBuffer
	}

	setPosition(x, y) {
		this.virtualPosition.x = x
		this.virtualPosition.y = y
	}

	generateVisibleItems() {
		const startCol = Math.floor(this.virtualPosition.x / this.spacingX)
		const startRow = Math.floor(this.virtualPosition.y / this.spacingY)

		const itemCount = this.gridDimensions.rows * this.gridDimensions.cols
		const items = new Array(itemCount)
		let index = 0

		for (let row = 0; row < this.gridDimensions.rows; row++) {
			for (let col = 0; col < this.gridDimensions.cols; col++) {
				const virtualX = startCol + col
				const virtualY = startRow + row

				items[index++] = {
					id: `${virtualX}-${virtualY}`,
					content: this.getContent(virtualX, virtualY),
					x: virtualX * this.spacingX,
					y: virtualY * this.spacingY
				}
			}
		}

		return items
	}
}

/**
 * Creates a throttled function that limits execution rate
 * @param {(...args: any[]) => any} fn
 * @param {number} [ms]
 * @returns {(...args: any[]) => any}
 */
export function throttle(fn, ms = 16) {
	let lastCall = 0
	/** @this {any} */
	return function (...args) {
		const now = Date.now()
		if (now - lastCall >= ms) {
			lastCall = now
			return fn.apply(this, args)
		}
	}
}
