export const BORDER_LAYER_ORDER = ['favorite', 'active', 'selected', 'live']

/**
 * Resolve visual state for a 3D channel card from IDs + flags.
 * @param {any} mediaItem
 * @param {{activeId?: string | null, selectedId?: string | null, hoveredId?: string | null}} ui
 */
export function resolveChannelCardStates(mediaItem, ui = {}) {
	if (!mediaItem) {
		return {
			isFavorite: false,
			isActive: false,
			isSelected: false,
			isLive: false,
			borderStyles: [],
			cardStyle: 'default',
			infoStyle: null
		}
	}

	const isFavorite = !!mediaItem.isFavorite
	const isActive = !!(mediaItem.id && ui.activeId && mediaItem.id === ui.activeId)
	const isSelected = !!(mediaItem.id && (mediaItem.id === ui.selectedId || mediaItem.id === ui.hoveredId))
	const isLive = !!mediaItem.isLive

	const activeStyles = []
	if (isFavorite) activeStyles.push('favorite')
	if (isActive) activeStyles.push('active')
	if (isSelected) activeStyles.push('selected')
	if (isLive) activeStyles.push('live')

	const borderStyles = BORDER_LAYER_ORDER.filter((s) => activeStyles.includes(s))

	let cardStyle = 'default'
	if (isSelected) cardStyle = 'selected'
	else if (isLive) cardStyle = 'live'
	else if (isActive) cardStyle = 'active'

	let infoStyle = null
	if (mediaItem.id === ui.selectedId) infoStyle = 'selected'
	else if (isActive) infoStyle = 'active'

	return {isFavorite, isActive, isSelected, isLive, borderStyles, cardStyle, infoStyle}
}

/**
 * Build the 2D canvas texture used by the 3D info panel.
 * @param {{
 *   mediaItem: any,
 *   style: 'active' | 'selected',
 *   activeId?: string | null,
 *   colors: {
 *     infoBgColor: string,
 *     infoTextColor: string,
 *     infoMutedColor: string,
 *     selectedBorderColor: string,
 *     selectedCardColor: string,
 *     activeBorderColor: string,
 *     activeCardColor: string,
 *     activeInfoTextColor: string,
 *     activeInfoMutedColor: string,
 *     liveBadgeBgColor: string,
 *     liveBadgeTextColor: string,
 *     favoriteBorderColor: string
 *   }
 * }} params
 */
export function buildChannelInfoCanvas(params) {
	const {mediaItem, style, activeId, colors} = params
	const channel = mediaItem.channel || {}
	const name = mediaItem.name || mediaItem.title || mediaItem.slug || ''
	const slug = mediaItem.slug ? `@${mediaItem.slug}` : ''
	const description = String(channel.description || mediaItem.description || '')
		.replace(/\s+/g, ' ')
		.trim()
	const parts = []
	if (Number.isFinite(channel.track_count)) parts.push(`${channel.track_count} tracks`)
	if (channel.latest_track_at) {
		const d = new Date(channel.latest_track_at)
		if (!Number.isNaN(d.getTime())) parts.push(`updated ${d.toLocaleDateString()}`)
	}
	const meta = parts.join(' · ')

	const canvas = document.createElement('canvas')
	canvas.width = 1024
	canvas.height = 380
	const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
	if (!ctx) return canvas
	ctx.clearRect(0, 0, canvas.width, canvas.height)

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {number} w
	 * @param {number} h
	 * @param {number} r
	 * @param {string} fill
	 * @param {string | null} [stroke]
	 */
	const drawRect = (x, y, w, h, r, fill, stroke = null) => {
		ctx.beginPath()
		ctx.moveTo(x + r, y)
		ctx.lineTo(x + w - r, y)
		ctx.quadraticCurveTo(x + w, y, x + w, y + r)
		ctx.lineTo(x + w, y + h - r)
		ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
		ctx.lineTo(x + r, y + h)
		ctx.quadraticCurveTo(x, y + h, x, y + h - r)
		ctx.lineTo(x, y + r)
		ctx.quadraticCurveTo(x, y, x + r, y)
		ctx.closePath()
		ctx.fillStyle = fill
		ctx.fill()
		if (stroke) {
			ctx.strokeStyle = stroke
			ctx.lineWidth = 2
			ctx.stroke()
		}
	}

	const drawWrappedText = (text, x, y, maxWidth, lineHeight, maxLines) => {
		if (!text) return
		const words = text.split(' ')
		const lines = []
		let line = ''
		for (const word of words) {
			const next = line ? `${line} ${word}` : word
			if (ctx.measureText(next).width <= maxWidth) {
				line = next
				continue
			}
			if (line) lines.push(line)
			line = word
			if (lines.length >= maxLines - 1) break
		}
		if (lines.length < maxLines && line) lines.push(line)
		if (lines.length) {
			const consumed = lines.join(' ').split(' ').length
			if (consumed < words.length) {
				lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,;:!?-]*$/, '')}...`
			}
		}
		for (let i = 0; i < lines.length; i++) {
			ctx.fillText(lines[i], x, y + i * lineHeight)
		}
	}

	const isActiveStyle = style === 'active'
	const panelBg = isActiveStyle ? colors.activeCardColor : colors.selectedCardColor
	const panelText = isActiveStyle ? colors.activeInfoTextColor : colors.infoTextColor
	const panelMuted = isActiveStyle ? colors.activeInfoMutedColor : colors.infoMutedColor
	const panelBorder = isActiveStyle ? colors.activeBorderColor : colors.selectedBorderColor
	drawRect(0, 0, canvas.width, canvas.height, 22, panelBg, panelBorder)
	ctx.fillStyle = panelText
	ctx.font = '700 52px sans-serif'
	ctx.textBaseline = 'top'
	ctx.fillText(name.slice(0, 46), 32, 26)
	ctx.font = '400 34px sans-serif'
	ctx.fillStyle = panelText
	ctx.fillText(slug, 32, 96)
	if (meta) {
		ctx.font = '400 30px sans-serif'
		ctx.fillStyle = panelMuted
		ctx.fillText(meta.slice(0, 72), 32, 152)
	}
	if (description) {
		ctx.font = '400 28px sans-serif'
		ctx.fillStyle = panelMuted
		drawWrappedText(description, 32, 194, canvas.width - 64, 34, 2)
	}

	const markers = []
	if (mediaItem.isFavorite) markers.push({shape: 'diamond', color: colors.favoriteBorderColor, size: 24})
	if (mediaItem.id === activeId) markers.push({shape: 'pill', color: colors.activeBorderColor, size: 28})
	if (style === 'selected') markers.push({shape: 'ring', color: colors.selectedBorderColor, size: 26})
	if (mediaItem.isLive) markers.push({shape: 'dot', color: colors.liveBadgeBgColor, size: 22})

	let mx = canvas.width - 44
	const my = 44
	for (const marker of markers) {
		ctx.save()
		ctx.translate(mx, my)
		if (marker.shape === 'dot') {
			ctx.beginPath()
			ctx.fillStyle = marker.color
			ctx.arc(0, 0, marker.size * 0.5, 0, Math.PI * 2)
			ctx.fill()
		} else if (marker.shape === 'ring') {
			ctx.beginPath()
			ctx.strokeStyle = marker.color
			ctx.lineWidth = 5
			ctx.arc(0, 0, marker.size * 0.5, 0, Math.PI * 2)
			ctx.stroke()
		} else if (marker.shape === 'pill') {
			const w = marker.size * 1.65
			const h = marker.size * 0.82
			drawRect(-w * 0.5, -h * 0.5, w, h, h * 0.5, marker.color)
		} else if (marker.shape === 'diamond') {
			const s = marker.size * 0.5
			ctx.rotate(Math.PI / 4)
			drawRect(-s * 0.9, -s * 0.9, s * 1.8, s * 1.8, 4, marker.color)
		}
		ctx.restore()
		mx -= marker.size + 14
	}

	return canvas
}
