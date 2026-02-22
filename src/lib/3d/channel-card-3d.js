export const BORDER_LAYER_ORDER = ['favorite', 'active', 'hover', 'selected', 'live']
export const CHANNEL_INFO_CANVAS = {width: 1024, height: 440}
import {formatDate} from '$lib/dates.js'

/**
 * @param {any} mediaItem
 * @param {any} colors
 */
function getCornerMarkers(mediaItem, colors) {
	const markers = []
	if (mediaItem?.isFavorite) {
		markers.push({kind: 'favorite', shape: 'diamond', color: colors.favoriteBorderColor, size: 22})
	}
	return markers
}

/**
 * @param {any} mediaItem
 */
function getTrackTotal(mediaItem) {
	if (Number.isFinite(mediaItem?.channel?.track_count)) return mediaItem.channel.track_count
	if (Number.isFinite(mediaItem?.track_count)) return mediaItem.track_count
	return null
}

/**
 * @param {any} mediaItem
 */
function getUpdatedLabel(mediaItem) {
	const latest = mediaItem?.channel?.latest_track_at
	if (!latest) return ''
	return formatDate(latest)
}

/**
 * Resolve visual state for a 3D channel card from IDs + flags.
 * @param {any} mediaItem
 * @param {{activeId?: string | null, activeIds?: string[] | null, selectedId?: string | null, hoveredId?: string | null}} ui
 */
export function resolveChannelCardStates(mediaItem, ui = {}) {
	if (!mediaItem) {
		return {
			isFavorite: false,
			isActive: false,
			isSelected: false,
			isHovered: false,
			isPlaying: false,
			isLive: false,
			borderStyles: [],
			cardStyle: 'default',
			infoStyle: null
		}
	}

	const isFavorite = !!mediaItem.isFavorite
	const uiActiveSet = new Set(
		Array.isArray(ui.activeIds) ? ui.activeIds.filter(Boolean) : ui.activeId ? [ui.activeId] : []
	)
	const isActive = !!mediaItem.isActive || !!(mediaItem.id && uiActiveSet.has(mediaItem.id))
	const isSelected = !!(mediaItem.id && mediaItem.id === ui.selectedId)
	const isHovered = !!(mediaItem.id && mediaItem.id === ui.hoveredId)
	const isPlaying = !!mediaItem.isPlaying
	const isLive = !!mediaItem.isLive

	// Keep one dominant border style at a time for a cleaner, unified composition.
	let dominantBorderStyle = 'default'
	if (isSelected) dominantBorderStyle = 'selected'
	else if (isActive) dominantBorderStyle = 'active'
	else if (isLive) dominantBorderStyle = 'live'
	else if (isFavorite) dominantBorderStyle = 'favorite'
	else if (isHovered) dominantBorderStyle = 'hover'

	const borderStyles = [dominantBorderStyle]

	let cardStyle = 'default'
	if (isPlaying) cardStyle = 'playing'
	else if (isActive) cardStyle = 'active'
	else if (isSelected) cardStyle = 'hover'
	else if (isLive) cardStyle = 'live'
	else if (isHovered) cardStyle = 'hover'

	let infoStyle = null
	if (isActive) infoStyle = 'active'
	else if (mediaItem.id === ui.selectedId) infoStyle = 'selected'

	return {isFavorite, isActive, isSelected, isHovered, isPlaying, isLive, borderStyles, cardStyle, infoStyle}
}

/**
 * Build the 2D canvas texture used by the 3D info panel.
 * @param {{
 *   mediaItem: any,
 *   style: 'active' | 'selected',
 *   activeId?: string | null,
 *   hoverTarget?: {id?: string, type: 'channel'|'tag'|'mention'|'tracks'|'rotate', token?: string | null} | null,
 *   colors: {
 *     infoBgColor: string,
 *     infoTextColor: string,
 *     infoMutedColor: string,
 *     tagBgColor: string,
 *     tagTextColor: string,
 *     tagHoverBgColor: string,
 *     tagHoverBorderColor: string,
 *     tagActiveBgColor: string,
 *     tagActiveTextColor: string,
 *     tagActiveBorderColor: string,
 *     selectedBorderColor: string,
 *     hoverBorderColor: string,
 *     selectedCardColor: string,
 *     playingCardColor: string,
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
	const {mediaItem, style, colors, hoverTarget = null} = params
	const normalizeToken = (value) =>
		String(value || '')
			.trim()
			.toLowerCase()
			.replace(/^[﹟＃]/, '#')
			.replace(/[.,;:!?]+$/g, '')
	const channel = mediaItem.channel || {}
	const name = mediaItem.name || mediaItem.title || mediaItem.slug || ''
	const slug = mediaItem.slug ? `@${mediaItem.slug}` : ''
	const description = String(channel.description || mediaItem.description || '')
		.replace(/\s+/g, ' ')
		.trim()
	const tags = Array.isArray(mediaItem.tags) ? mediaItem.tags : []
	const mentions = Array.isArray(mediaItem.mentions) ? mediaItem.mentions : []
	const activeTags = new Set(
		Array.isArray(mediaItem.activeTags) ? mediaItem.activeTags.map((t) => normalizeToken(t)).filter(Boolean) : []
	)
	const activeMentions = new Set(
		Array.isArray(mediaItem.activeMentions)
			? mediaItem.activeMentions.map((m) => normalizeToken(m)).filter(Boolean)
			: []
	)
	const trackTotal = Number.isFinite(channel.track_count) ? channel.track_count : null
	const totalLabel = trackTotal != null ? `(${trackTotal})` : ''
	const updatedLabel = getUpdatedLabel(mediaItem)

	const canvas = document.createElement('canvas')
	canvas.width = CHANNEL_INFO_CANVAS.width
	canvas.height = CHANNEL_INFO_CANVAS.height
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
				const last = lines.at(-1) || ''
				lines[lines.length - 1] = `${last.replace(/[.,;:!?-]*$/, '')}...`
			}
		}
		for (let i = 0; i < lines.length; i++) {
			ctx.fillText(lines[i], x, y + i * lineHeight)
		}
	}
	const drawChipsRow = (tokens, y, palette, maxRows = 1) => {
		if (!tokens.length) return y
		let x = 32
		const rowHeight = 40
		let row = 0
		for (let i = 0; i < tokens.length; i++) {
			const token = String(tokens[i])
			const isActiveToken = palette.activeSet.has(normalizeToken(token))
			const isHoverToken = hoverTarget?.type === palette.kind && hoverTarget?.token === token
			const bg = isActiveToken ? palette.activeBg : isHoverToken ? palette.hoverBg : palette.bg
			const fg = isActiveToken ? palette.activeFg : palette.fg
			const stroke = isActiveToken ? palette.activeBorder : isHoverToken ? palette.hoverBorder : null
			ctx.font = '600 24px sans-serif'
			const tw = ctx.measureText(token).width
			const chipW = Math.ceil(tw + 24)
			if (x + chipW > canvas.width - 32) {
				row += 1
				if (row >= maxRows) {
					const remaining = tokens.length - i
					const more = `+${remaining}`
					const mw = Math.ceil(ctx.measureText(more).width + 24)
					drawRect(x, y + rowHeight * (row - 1), mw, 32, 10, palette.bg)
					ctx.fillStyle = palette.fg
					ctx.fillText(more, x + 12, y + rowHeight * (row - 1) + 5)
					return y + rowHeight * row
				}
				x = 32
			}
			drawRect(x, y + rowHeight * row, chipW, 32, 10, bg, stroke)
			ctx.fillStyle = fg
			ctx.fillText(token, x + 12, y + rowHeight * row + 5)
			x += chipW + 10
		}
		return y + rowHeight * (row + 1)
	}

	const contrastProbe = /** @type {CanvasRenderingContext2D | null} */ (
		document.createElement('canvas').getContext('2d')
	)
	const parseCssColor = (input) => {
		if (!contrastProbe) return null
		contrastProbe.fillStyle = '#000000'
		contrastProbe.fillStyle = input
		const normalized = String(contrastProbe.fillStyle)
		if (!normalized.startsWith('#') || normalized.length !== 7) return null
		const r = parseInt(normalized.slice(1, 3), 16)
		const g = parseInt(normalized.slice(3, 5), 16)
		const b = parseInt(normalized.slice(5, 7), 16)
		return {r, g, b}
	}
	const pickReadableText = (bgColor) => {
		const rgb = parseCssColor(bgColor)
		if (!rgb) return {text: colors.infoTextColor, muted: colors.infoMutedColor}
		const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255
		if (luminance < 0.46) return {text: '#ffffff', muted: 'rgba(255,255,255,0.82)'}
		return {text: '#111111', muted: 'rgba(17,17,17,0.76)'}
	}

	const isActiveStyle = style === 'active'
	const isEmphasisStyle = isActiveStyle || mediaItem.isPlaying
	const panelBg = mediaItem.isPlaying
		? colors.playingCardColor
		: isActiveStyle
			? colors.activeCardColor
			: colors.infoBgColor
	const readable = pickReadableText(panelBg)
	const panelText = isEmphasisStyle ? readable.text : colors.infoTextColor
	const panelMuted = isEmphasisStyle ? readable.muted : colors.infoMutedColor

	ctx.fillStyle = panelText
	ctx.font = '700 52px sans-serif'
	ctx.textBaseline = 'top'
	const titleText = name.slice(0, 46)
	ctx.fillText(titleText, 32, 26)
	const titleWidth = ctx.measureText(titleText).width
	if (hoverTarget?.type === 'channel' && hoverTarget?.token === 'title') {
		ctx.beginPath()
		ctx.strokeStyle = panelText
		ctx.lineWidth = 2
		ctx.moveTo(32, 82)
		ctx.lineTo(32 + titleWidth, 82)
		ctx.stroke()
	}
	ctx.font = '400 34px sans-serif'
	ctx.fillStyle = panelText
	ctx.fillText(slug, 32, 96)
	const slugWidth = ctx.measureText(slug).width
	if (hoverTarget?.type === 'channel' && hoverTarget?.token === 'slug') {
		ctx.beginPath()
		ctx.strokeStyle = panelText
		ctx.lineWidth = 2
		ctx.moveTo(32, 132)
		ctx.lineTo(32 + slugWidth, 132)
		ctx.stroke()
	}
	if (description) {
		ctx.font = '400 28px sans-serif'
		ctx.fillStyle = panelMuted
		drawWrappedText(description, 32, 194, canvas.width - 64, 34, 2)
	}
	let chipsY = 272
	chipsY = drawChipsRow(
		tags,
		chipsY,
		{
			kind: 'tag',
			bg: colors.tagBgColor,
			hoverBg: colors.tagHoverBgColor,
			hoverBorder: colors.tagHoverBorderColor,
			fg: colors.tagTextColor || panelText,
			activeBg: colors.tagActiveBgColor,
			activeFg: colors.tagActiveTextColor,
			activeBorder: colors.tagActiveBorderColor,
			activeSet: activeTags
		},
		1
	)
	drawChipsRow(
		mentions,
		chipsY,
		{
			kind: 'mention',
			bg: colors.tagBgColor,
			hoverBg: colors.tagHoverBgColor,
			hoverBorder: colors.tagHoverBorderColor,
			fg: colors.tagTextColor || panelText,
			activeBg: colors.tagActiveBgColor,
			activeFg: colors.tagActiveTextColor,
			activeBorder: colors.tagActiveBorderColor,
			activeSet: activeMentions
		},
		1
	)

	const metaY = canvas.height - 42
	const metaCenterY = metaY + 16
	let totalLabelWidth = 0
	if (totalLabel) {
		ctx.font = '400 30px sans-serif'
		ctx.fillStyle = panelMuted
		ctx.fillText(totalLabel, 32, metaY)
		totalLabelWidth = ctx.measureText(totalLabel).width
		if (hoverTarget?.type === 'tracks') {
			ctx.beginPath()
			ctx.strokeStyle = panelText
			ctx.lineWidth = 2
			ctx.moveTo(32, metaY + 32)
			ctx.lineTo(32 + totalLabelWidth, metaY + 32)
			ctx.stroke()
		}
	}
	if (mediaItem?.canToggleRotate) {
		const enabled = !!mediaItem?.isRotateEnabled
		const isHoverRotate = hoverTarget?.type === 'rotate'
		const rotateSize = 22
		const rotateCenterX = 32 + (totalLabelWidth || 0) + 26
		const rotateColor = enabled
			? colors.tagActiveBgColor
			: isHoverRotate
				? panelText
				: panelMuted
		ctx.save()
		ctx.translate(rotateCenterX, metaCenterY)
		if (enabled) {
			ctx.rotate(Math.PI / 4)
			const s = rotateSize * 0.5
			drawRect(-s * 0.9, -s * 0.9, s * 1.8, s * 1.8, 4, rotateColor)
		} else {
			ctx.beginPath()
			ctx.strokeStyle = rotateColor
			ctx.lineWidth = 4
			ctx.arc(0, 0, rotateSize * 0.5, 0, Math.PI * 2)
			ctx.stroke()
		}
		ctx.restore()
	}
	if (updatedLabel) {
		ctx.font = '400 30px sans-serif'
		ctx.fillStyle = panelMuted
		const uw = ctx.measureText(updatedLabel).width
		ctx.fillText(updatedLabel, canvas.width - 32 - uw, metaY)
		if (hoverTarget?.type === 'tracks') {
			ctx.beginPath()
			ctx.strokeStyle = panelText
			ctx.lineWidth = 2
			ctx.moveTo(canvas.width - 32 - uw, metaY + 32)
			ctx.lineTo(canvas.width - 32, metaY + 32)
			ctx.stroke()
		}
	}

	const markers = getCornerMarkers(mediaItem, colors)

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

/**
 * Resolve click intent on the open info panel texture.
 * @param {{mediaItem: any, x: number, y: number}} params
 * @returns {{href?: string, type: 'channel'|'tag'|'mention'|'tracks'|'rotate', token: string | null} | null}
 */
export function resolveChannelInfoClickTarget(params) {
	const {mediaItem, x, y} = params
	const slug = mediaItem?.slug
	if (!slug) return null
	if (x < 0 || y < 0 || x > CHANNEL_INFO_CANVAS.width || y > CHANNEL_INFO_CANVAS.height) return null
	const measure = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'))
	if (!measure) return null
	measure.font = '400 30px sans-serif'
	const trackTotal = getTrackTotal(mediaItem)
	const totalLabel = trackTotal != null ? `(${trackTotal})` : ''
	const totalWidth = totalLabel ? measure.measureText(totalLabel).width : 0
	const metaY = CHANNEL_INFO_CANVAS.height - 42
	const rotateSize = 22
	const rotateCenterX = 32 + (totalWidth || 0) + 26
	const rotateCenterY = metaY + 16
	measure.font = '700 52px sans-serif'
	const titleText = String(mediaItem?.name || mediaItem?.title || mediaItem?.slug || '').slice(0, 46)
	const titleWidth = measure.measureText(titleText).width
	if (x >= 32 && x <= 32 + titleWidth && y >= 26 && y <= 86) {
		return {href: `/${encodeURIComponent(slug)}`, type: 'channel', token: 'title'}
	}
	measure.font = '400 34px sans-serif'
	const slugLabel = mediaItem?.slug ? `@${mediaItem.slug}` : ''
	const slugWidth = measure.measureText(slugLabel).width
	if (x >= 32 && x <= 32 + slugWidth && y >= 96 && y <= 136) {
		return {href: `/${encodeURIComponent(slug)}`, type: 'channel', token: 'slug'}
	}
	if (mediaItem?.canToggleRotate) {
		const half = rotateSize * 0.5
		if (
			x >= rotateCenterX - half - 4 &&
			x <= rotateCenterX + half + 4 &&
			y >= rotateCenterY - half - 4 &&
			y <= rotateCenterY + half + 4
		) {
			return {type: 'rotate', token: 'toggle'}
		}
	}

	const markers = getCornerMarkers(mediaItem, {
		favoriteBorderColor: '#ffb800'
	})
	let mx = CHANNEL_INFO_CANVAS.width - 44
	const my = 44
	for (const marker of markers) {
		const half = marker.size * 0.5
		if (x >= mx - half - 4 && x <= mx + half + 4 && y >= my - half - 4 && y <= my + half + 4) {
			if (marker.kind === 'favorite') return null
		}
		mx -= marker.size + 14
	}

	if (trackTotal != null) {
		if (x >= 32 && x <= 32 + totalWidth && y >= metaY && y <= metaY + 36) {
			return {href: `/${encodeURIComponent(slug)}/tracks`, type: 'tracks', token: null}
		}
		const updatedLabel = getUpdatedLabel(mediaItem)
		if (updatedLabel) {
			const uw = measure.measureText(updatedLabel).width
			const ux = CHANNEL_INFO_CANVAS.width - 32 - uw
			if (x >= ux && x <= CHANNEL_INFO_CANVAS.width - 32 && y >= metaY && y <= metaY + 36) {
				return {href: `/${encodeURIComponent(slug)}/image`, type: 'channel', token: null}
			}
		}
	}

	const tags = Array.isArray(mediaItem?.tags) ? mediaItem.tags : []
	const mentions = Array.isArray(mediaItem?.mentions) ? mediaItem.mentions : []
	measure.font = '600 24px sans-serif'

	/**
	 * @param {string[]} tokens
	 * @param {number} startY
	 * @param {number} maxRows
	 * @param {'tag'|'mention'} kind
	 */
	const hitChips = (tokens, startY, maxRows, kind) => {
		if (!tokens.length) return {hit: null, nextY: startY}
		let cx = 32
		const rowHeight = 40
		const chipH = 32
		let row = 0
		for (let i = 0; i < tokens.length; i++) {
			const token = String(tokens[i])
			const chipW = Math.ceil(measure.measureText(token).width + 24)
			if (cx + chipW > CHANNEL_INFO_CANVAS.width - 32) {
				row += 1
				if (row >= maxRows) {
					const remaining = tokens.length - i
					const more = `+${remaining}`
					const mw = Math.ceil(measure.measureText(more).width + 24)
					const my = startY + rowHeight * (row - 1)
					if (x >= cx && x <= cx + mw && y >= my && y <= my + chipH) {
						return {hit: {kind, token: null}, nextY: startY + rowHeight * row}
					}
					return {hit: null, nextY: startY + rowHeight * row}
				}
				cx = 32
			}
			const cy = startY + rowHeight * row
			if (x >= cx && x <= cx + chipW && y >= cy && y <= cy + chipH) {
				return {hit: {kind, token}, nextY: startY + rowHeight * (row + 1)}
			}
			cx += chipW + 10
		}
		return {hit: null, nextY: startY + rowHeight * (row + 1)}
	}

	const tagHit = hitChips(tags, 272, 1, 'tag')
	if (tagHit.hit?.kind === 'tag' && tagHit.hit.token?.startsWith('#')) {
		return {
			type: 'tag',
			token: tagHit.hit.token
		}
	}
	const mentionHit = hitChips(mentions, tagHit.nextY, 1, 'mention')
	if (mentionHit.hit?.kind === 'mention' && mentionHit.hit.token?.startsWith('@')) {
		return {
			href: `/${encodeURIComponent(mentionHit.hit.token.slice(1))}`,
			type: 'mention',
			token: mentionHit.hit.token
		}
	}

	return null
}
