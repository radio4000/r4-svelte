/**
 * WebGL infinite canvas with chunk-based rendering using OGL
 * Parallel implementation for bundle size and performance comparison
 */
import {Renderer, Camera, Transform, Mesh, Plane, Torus, Program, Texture, Vec3} from 'ogl'

const CHUNK_SIZE = 110
const RENDER_DISTANCE = 2
const CHUNK_FADE_MARGIN = 1
const MAX_VELOCITY = 3.2
const KEYBOARD_SPEED = 0.18
const VELOCITY_LERP = 0.16
const VELOCITY_DECAY = 0.9
const INITIAL_CAMERA_Z = 50
const ITEMS_PER_CHUNK = 5
const DEPTH_FADE_END = 260

const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

function hashString(str) {
	let hash = 0
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
	}
	return Math.abs(hash)
}

const seededRandom = (seed) => {
	const x = Math.sin(seed) * 10000
	return x - Math.floor(x)
}

const CHUNK_OFFSETS = (() => {
	const maxDist = RENDER_DISTANCE + CHUNK_FADE_MARGIN
	const offsets = []
	for (let dx = -maxDist; dx <= maxDist; dx++) {
		for (let dy = -maxDist; dy <= maxDist; dy++) {
			for (let dz = -maxDist; dz <= maxDist; dz++) {
				const dist = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz))
				if (dist <= maxDist) offsets.push({dx, dy, dz, dist})
			}
		}
	}
	return offsets
})()

const vec3 = (x = 0, y = 0, z = 0) => ({x, y, z})
const vec2 = (x = 0, y = 0) => ({x, y})

// Vertex shader for colored quads — derives color from world position
const colorVertexShader = `
	attribute vec3 position;
	uniform mat4 modelViewMatrix;
	uniform mat4 projectionMatrix;
	uniform mat4 modelMatrix;
	uniform float uCameraZ;
	varying vec3 vWorldPos;
	varying float vDepthFade;
	void main() {
		vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
		float dist = abs(vWorldPos.z - uCameraZ);
		vDepthFade = 1.0 - smoothstep(140.0, 260.0, dist);
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

const colorFragmentShader = `
	precision highp float;
	varying vec3 vWorldPos;
	varying float vDepthFade;
	void main() {
		if (vDepthFade < 0.01) discard;
		vec3 col;
		col.r = 0.4 + 0.4 * sin(vWorldPos.x * 0.05 + 1.0);
		col.g = 0.4 + 0.4 * sin(vWorldPos.y * 0.05 + 2.0);
		col.b = 0.4 + 0.4 * sin(vWorldPos.x * 0.03 + vWorldPos.y * 0.03 + 4.0);
		gl_FragColor = vec4(col, vDepthFade);
	}
`

const texturedVertexShader = `
	attribute vec3 position;
	attribute vec2 uv;
	uniform mat4 modelViewMatrix;
	uniform mat4 projectionMatrix;
	uniform mat4 modelMatrix;
	uniform float uCameraZ;
	varying vec2 vUv;
	varying float vDepthFade;
	void main() {
		vUv = uv;
		vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
		float dist = abs(worldPos.z - uCameraZ);
		vDepthFade = 1.0 - smoothstep(140.0, 260.0, dist);
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

const texturedFragmentShader = `
	precision highp float;
	uniform sampler2D tMap;
	varying vec2 vUv;
	varying float vDepthFade;
	void main() {
		if (vDepthFade < 0.01) discard;
		vec4 color = texture2D(tMap, vUv);
		if (color.a < 0.01) discard;
		gl_FragColor = vec4(color.rgb, color.a * vDepthFade);
	}
`

const borderVertexShader = `
	attribute vec3 position;
	uniform mat4 modelViewMatrix;
	uniform mat4 projectionMatrix;
	void main() {
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

const borderFragmentShader = `
	precision highp float;
	uniform vec3 uColor;
	void main() {
		gl_FragColor = vec4(uColor, 1.0);
	}
`

const ENTRANCE_DURATION = 900
const EXIT_DURATION = 500
const ENTRANCE_STAGGER = 80
const EXIT_STAGGER = 40
const IMAGE_INSET = 0.94
const MAX_CHUNKS_PER_FRAME = 4

export class InfiniteCanvasOGL {
	constructor(container, config = {}) {
		this.container = container
		this.media = config.media || []
		this.activeId = config.activeId
		this.accentColor = config.accentColor || '#ff0000'
		this.onClick = config.onClick
		this.backgroundColor = config.backgroundColor ?? null

		this.velocity = vec3()
		this.targetVel = vec3()
		this.basePos = vec3(0, 0, INITIAL_CAMERA_Z)
		this.drift = vec2()
		this.mouse = vec2()
		this.lastMouse = vec2()
		this.scrollAccum = 0
		this.isDragging = false
		this.dragDistance = 0
		this.lastChunkKey = ''
		this.lastChunkUpdate = 0

		this.keys = {forward: false, backward: false, left: false, right: false, up: false, down: false}
		this.chunks = new Map()
		this.chunkQueue = []
		this.animatingChunks = new Set()
		this.exitingChunks = new Map()
		this.planeCache = new Map()
		this.textureCache = new Map()
		this.disposed = false
		this.hoveredItem = null

		// Pre-allocated raycast buffers (avoid per-frame GC pressure)
		this._rayNear = new Vec3()
		this._rayFar = new Vec3()
		this._rayDir = new Vec3()
		this._rayResult = new Vec3()
		this._vpMatrix = new Float32Array(16)
		this._vpInverse = new Float32Array(16)
		this._planeNormal = new Vec3(0, 0, 1)
		this._toPlane = new Vec3()
		this._hitPoint = new Vec3()
		this._localPoint = new Vec3()

		this.init()
		this.createTooltip()
	}

	init() {
		const width = this.container.clientWidth
		const height = this.container.clientHeight

		// Initialize OGL renderer
		this.renderer = new Renderer({
			dpr: Math.min(window.devicePixelRatio, 1.5),
			alpha: true,
			antialias: false,
			powerPreference: 'high-performance'
		})
		this.gl = this.renderer.gl
		if (!this.gl || !this.gl.canvas) throw new Error('Failed to initialize WebGL')
		this.container.appendChild(this.gl.canvas)

		// Set canvas size (CSS sizing handled by parent)
		this.renderer.setSize(width, height)

		// Set background color if provided
		if (this.backgroundColor) {
			const color = this.parseColor(this.backgroundColor)
			this.gl.clearColor(color[0], color[1], color[2], 1)
		} else {
			this.gl.clearColor(0, 0, 0, 0)
		}

		// Create camera
		this.camera = new Camera(this.gl, {fov: 60, aspect: width / height, near: 1, far: 500})
		this.camera.position.set(0, 0, INITIAL_CAMERA_Z)

		// Create scene root
		this.scene = new Transform()

		// Create shared geometries
		this.planeGeometry = new Plane(this.gl, {width: 1, height: 1})
		this.torusGeometry = new Torus(this.gl, {radius: 0.75, tube: 0.015, radialSegments: 8, tubularSegments: 64})

		// 1x1 canvas placeholder avoids "Alpha-premult and y-flip deprecated" warnings
		// that fire when OGL uploads a typed-array default texture
		this._placeholder = document.createElement('canvas')
		this._placeholder.width = 1
		this._placeholder.height = 1

		// Shared program for colored quads (no media) — compiled once
		this.colorProgram = new Program(this.gl, {
			vertex: colorVertexShader,
			fragment: colorFragmentShader,
			uniforms: {uCameraZ: {value: INITIAL_CAMERA_Z}},
			transparent: true,
			depthTest: true,
			depthWrite: false
		})

		// Shared program for textured quads — compiled once, texture swapped per-mesh
		this.texturedProgram = new Program(this.gl, {
			vertex: texturedVertexShader,
			fragment: texturedFragmentShader,
			uniforms: {
				tMap: {value: new Texture(this.gl, {image: this._placeholder, generateMipmaps: false})},
				uCameraZ: {value: INITIAL_CAMERA_Z}
			},
			transparent: true,
			depthTest: true,
			depthWrite: false
		})

		// Border program for rotating torus around active items
		const accentRGB = this.parseColor(this.accentColor)
		this.borderProgram = new Program(this.gl, {
			vertex: borderVertexShader,
			fragment: borderFragmentShader,
			uniforms: {uColor: {value: accentRGB}},
			transparent: false,
			depthTest: true,
			depthWrite: true
		})

		this.bindEvents()
		this.updateChunks(true)
		this.animate()
	}

	parseColor(color) {
		// Use a 2d canvas to normalize any CSS color (hex, rgb, oklch, etc.) to #rrggbb
		const ctx = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'))
		ctx.fillStyle = color
		const hex = /** @type {string} */ (ctx.fillStyle) // always normalizes to #rrggbb
		const r = parseInt(hex.slice(1, 3), 16) / 255
		const g = parseInt(hex.slice(3, 5), 16) / 255
		const b = parseInt(hex.slice(5, 7), 16) / 255
		return [r, g, b]
	}

	bindEvents() {
		if (!this.gl?.canvas) return
		const canvas = this.gl.canvas
		canvas.style.cursor = 'grab'

		canvas.addEventListener('mousedown', (e) => {
			this.isDragging = true
			this.dragDistance = 0
			this.lastMouse = {x: e.clientX, y: e.clientY}
			this.mouseDownPos = {x: e.clientX, y: e.clientY}
			canvas.style.cursor = 'grabbing'
		})

		window.addEventListener('mouseup', (e) => {
			if (this.isDragging && this.dragDistance < 5 && this.onClick) {
				this.handleClick(e)
			}
			this.isDragging = false
			canvas.style.cursor = 'grab'
		})

		window.addEventListener('mousemove', (e) => {
			this.mouse = {
				x: (e.clientX / window.innerWidth) * 2 - 1,
				y: -(e.clientY / window.innerHeight) * 2 + 1
			}
			if (this.isDragging) {
				const dx = e.clientX - this.lastMouse.x
				const dy = e.clientY - this.lastMouse.y
				this.dragDistance += Math.abs(dx) + Math.abs(dy)
				this.targetVel.x -= dx * 0.025
				this.targetVel.y += dy * 0.025
				this.lastMouse = {x: e.clientX, y: e.clientY}
			}
			this.updateTooltip(e)
		})

		canvas.addEventListener('mouseleave', () => {
			this.mouse = {x: 0, y: 0}
			this.isDragging = false
			canvas.style.cursor = 'grab'
		})

		canvas.addEventListener(
			'wheel',
			(e) => {
				e.preventDefault()
				this.scrollAccum += e.deltaY * 0.006
			},
			{passive: false}
		)

		window.addEventListener('keydown', (e) => this.handleKey(e.key, true))
		window.addEventListener('keyup', (e) => this.handleKey(e.key, false))

		this.resizeObserver = new ResizeObserver(() => this.resize())
		this.resizeObserver.observe(this.container)

		// Touch events
		let lastTouches = []
		let lastTouchDist = 0
		let touchStartPos = null
		let touchDragDistance = 0

		const getTouchDistance = (touches) => {
			if (touches.length < 2) return 0
			const dx = touches[0].clientX - touches[1].clientX
			const dy = touches[0].clientY - touches[1].clientY
			return Math.sqrt(dx * dx + dy * dy)
		}

		canvas.addEventListener(
			'touchstart',
			(e) => {
				e.preventDefault()
				lastTouches = [...e.touches]
				lastTouchDist = getTouchDistance(lastTouches)
				if (e.touches.length === 1) {
					touchStartPos = {x: e.touches[0].clientX, y: e.touches[0].clientY}
					touchDragDistance = 0
				}
			},
			{passive: false}
		)

		canvas.addEventListener(
			'touchmove',
			(e) => {
				e.preventDefault()
				const touches = [...e.touches]
				if (touches.length === 1 && lastTouches.length >= 1) {
					const dx = touches[0].clientX - lastTouches[0].clientX
					const dy = touches[0].clientY - lastTouches[0].clientY
					touchDragDistance += Math.abs(dx) + Math.abs(dy)
					this.targetVel.x -= dx * 0.02
					this.targetVel.y += dy * 0.02
				} else if (touches.length === 2 && lastTouchDist > 0) {
					const dist = getTouchDistance(touches)
					this.scrollAccum += (lastTouchDist - dist) * 0.006
					lastTouchDist = dist
				}
				lastTouches = touches
			},
			{passive: false}
		)

		canvas.addEventListener(
			'touchend',
			(e) => {
				if (touchStartPos && touchDragDistance < 10 && this.onClick) {
					this.handleClick({clientX: touchStartPos.x, clientY: touchStartPos.y})
				}
				touchStartPos = null
				lastTouches = [...e.touches]
				lastTouchDist = getTouchDistance(lastTouches)
			},
			{passive: false}
		)
	}

	createTooltip() {
		this.tooltip = document.createElement('div')
		Object.assign(this.tooltip.style, {
			position: 'absolute',
			padding: '6px 10px',
			background: 'rgba(0, 0, 0, 0.85)',
			color: '#fff',
			fontSize: '13px',
			borderRadius: '4px',
			pointerEvents: 'none',
			opacity: '0',
			transition: 'opacity 0.15s',
			maxWidth: '280px',
			whiteSpace: 'nowrap',
			overflow: 'hidden',
			textOverflow: 'ellipsis',
			zIndex: '1000'
		})
		this.container.appendChild(this.tooltip)
	}

	updateTooltip(e) {
		if (!this.tooltip || !this.gl?.canvas) return
		if (this.isDragging) {
			this.tooltip.style.opacity = '0'
			return
		}

		const intersected = this.raycast(e)
		if (intersected) {
			const mediaItem = intersected.userData.mediaItem
			if (mediaItem && mediaItem !== this.hoveredItem) {
				this.hoveredItem = mediaItem
				const name = mediaItem.name || mediaItem.title || mediaItem.slug || ''
				this.tooltip.textContent = name
			}
			const rect = this.gl.canvas.getBoundingClientRect()
			this.tooltip.style.opacity = '1'
			this.tooltip.style.left = `${e.clientX - rect.left + 12}px`
			this.tooltip.style.top = `${e.clientY - rect.top + 12}px`
			this.gl.canvas.style.cursor = 'pointer'
		} else {
			this.tooltip.style.opacity = '0'
			this.hoveredItem = null
			this.gl.canvas.style.cursor = this.isDragging ? 'grabbing' : 'grab'
		}
	}

	handleClick(e) {
		const intersected = this.raycast(e)
		if (intersected) {
			const mediaItem = intersected.userData.mediaItem
			if (mediaItem) this.onClick(mediaItem)
		}
	}

	raycast(e) {
		if (!this.gl?.canvas) return null
		const rect = this.gl.canvas.getBoundingClientRect()
		const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
		const y = -((e.clientY - rect.top) / rect.height) * 2 + 1

		// Manual raycasting for planes
		// Create ray from camera through mouse position
		const ray = this.getRay(x, y)

		let closest = null
		let closestDist = Infinity

		for (const group of this.chunks.values()) {
			for (const mesh of group.children) {
				if (!mesh.visible || mesh.userData.isBorder) continue

				const intersection = this.rayPlaneIntersection(ray, mesh)
				if (intersection && intersection.distance < closestDist) {
					closestDist = intersection.distance
					closest = mesh
				}
			}
		}

		return closest
	}

	getRay(x, y) {
		if (!this.camera) return null
		// Compute VP inverse once per raycast (not twice)
		const m = this._vpInverse
		this.multiplyMatrices(this._vpMatrix, this.camera.projectionMatrix, this.camera.viewMatrix)
		this.invertMatrix(m, this._vpMatrix)

		// Unproject near (z=-1) into pre-allocated origin
		const origin = this._rayNear
		this.unprojectWith(m, x, y, -1, origin)

		// Unproject far (z=1) into temp, compute direction
		const far = this._rayFar
		this.unprojectWith(m, x, y, 1, far)

		const direction = this._rayDir
		direction.sub(far, origin).normalize()

		return {origin, direction}
	}

	unprojectWith(m, x, y, z, out) {
		const w = 1.0 / (m[3] * x + m[7] * y + m[11] * z + m[15])
		out.x = (m[0] * x + m[4] * y + m[8] * z + m[12]) * w
		out.y = (m[1] * x + m[5] * y + m[9] * z + m[13]) * w
		out.z = (m[2] * x + m[6] * y + m[10] * z + m[14]) * w
	}

	multiplyMatrices(out, a, b) {
		const a00 = a[0],
			a01 = a[1],
			a02 = a[2],
			a03 = a[3]
		const a10 = a[4],
			a11 = a[5],
			a12 = a[6],
			a13 = a[7]
		const a20 = a[8],
			a21 = a[9],
			a22 = a[10],
			a23 = a[11]
		const a30 = a[12],
			a31 = a[13],
			a32 = a[14],
			a33 = a[15]

		let b0 = b[0],
			b1 = b[1],
			b2 = b[2],
			b3 = b[3]
		out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
		out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
		out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
		out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

		b0 = b[4]
		b1 = b[5]
		b2 = b[6]
		b3 = b[7]
		out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
		out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
		out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
		out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

		b0 = b[8]
		b1 = b[9]
		b2 = b[10]
		b3 = b[11]
		out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
		out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
		out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
		out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

		b0 = b[12]
		b1 = b[13]
		b2 = b[14]
		b3 = b[15]
		out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
		out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
		out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
		out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
	}

	invertMatrix(out, a) {
		const a00 = a[0],
			a01 = a[1],
			a02 = a[2],
			a03 = a[3]
		const a10 = a[4],
			a11 = a[5],
			a12 = a[6],
			a13 = a[7]
		const a20 = a[8],
			a21 = a[9],
			a22 = a[10],
			a23 = a[11]
		const a30 = a[12],
			a31 = a[13],
			a32 = a[14],
			a33 = a[15]

		const b00 = a00 * a11 - a01 * a10
		const b01 = a00 * a12 - a02 * a10
		const b02 = a00 * a13 - a03 * a10
		const b03 = a01 * a12 - a02 * a11
		const b04 = a01 * a13 - a03 * a11
		const b05 = a02 * a13 - a03 * a12
		const b06 = a20 * a31 - a21 * a30
		const b07 = a20 * a32 - a22 * a30
		const b08 = a20 * a33 - a23 * a30
		const b09 = a21 * a32 - a22 * a31
		const b10 = a21 * a33 - a23 * a31
		const b11 = a22 * a33 - a23 * a32

		let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
		if (!det) return out
		det = 1.0 / det

		out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det
		out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det
		out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det
		out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det
		out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det
		out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det
		out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det
		out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det
		out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det
		out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det
		out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det
		out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det
		out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det
		out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det
		out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det
		out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det

		return out
	}

	rayPlaneIntersection(ray, mesh) {
		const n = this._planeNormal
		const denom = ray.direction.dot(n)
		if (Math.abs(denom) < 0.0001) return null

		const worldPos = mesh.position
		this._toPlane.sub(worldPos, ray.origin)
		const t = this._toPlane.dot(n) / denom
		if (t < 0) return null

		// Check if hit point is within plane bounds
		const lp = this._localPoint
		lp.x = ray.origin.x + ray.direction.x * t - worldPos.x
		lp.y = ray.origin.y + ray.direction.y * t - worldPos.y

		const halfWidth = mesh.scale.x * 0.5
		const halfHeight = mesh.scale.y * 0.5

		if (Math.abs(lp.x) <= halfWidth && Math.abs(lp.y) <= halfHeight) {
			return {distance: t}
		}

		return null
	}

	handleKey(key, down) {
		const keyMap = {
			w: 'forward',
			W: 'forward',
			ArrowUp: 'forward',
			s: 'backward',
			S: 'backward',
			ArrowDown: 'backward',
			a: 'left',
			A: 'left',
			ArrowLeft: 'left',
			d: 'right',
			D: 'right',
			ArrowRight: 'right',
			e: 'up',
			E: 'up',
			q: 'down',
			Q: 'down'
		}
		if (keyMap[key]) this.keys[keyMap[key]] = down
	}

	resize() {
		if (this.disposed || !this.camera || !this.renderer) return
		const width = this.container.clientWidth
		const height = this.container.clientHeight
		this.camera.perspective({aspect: width / height})
		this.renderer.setSize(width, height)
	}

	generateChunkPlanes(cx, cy, cz) {
		const key = `${cx},${cy},${cz}`
		if (this.planeCache.has(key)) return this.planeCache.get(key)

		const planes = []
		const seed = hashString(key)

		for (let i = 0; i < ITEMS_PER_CHUNK; i++) {
			const s = seed + i * 1000
			const r = (n) => seededRandom(s + n)
			const size = 12 + r(4) * 8

			planes.push({
				id: `${cx}-${cy}-${cz}-${i}`,
				position: {
					x: cx * CHUNK_SIZE + r(0) * CHUNK_SIZE,
					y: cy * CHUNK_SIZE + r(1) * CHUNK_SIZE,
					z: cz * CHUNK_SIZE + r(2) * CHUNK_SIZE
				},
				scale: {x: size, y: size, z: 1},
				mediaIndex: Math.floor(r(5) * 1_000_000)
			})
		}

		this.planeCache.set(key, planes)
		return planes
	}

	getTexture(url) {
		if (this.textureCache.has(url)) return this.textureCache.get(url)
		if (!this.gl) return null

		const texture = new Texture(this.gl, {
			image: this._placeholder,
			generateMipmaps: false,
			minFilter: this.gl.LINEAR,
			magFilter: this.gl.LINEAR
		})
		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.onload = () => {
			texture.image = img
			texture.generateMipmaps = true
			texture.minFilter = /** @type {GLenum} */ (this.gl?.LINEAR_MIPMAP_LINEAR)
		}
		img.onerror = () => {
			console.warn('Texture load failed:', url)
		}
		img.src = url
		this.textureCache.set(url, texture)
		return texture
	}

	setActiveId(id) {
		if (this.activeId === id) return
		this.activeId = id
		for (const group of this.chunks.values()) {
			// Snapshot children to avoid mutation during iteration
			const children = [...group.children]
			for (const mesh of children) {
				const ud = mesh.userData
				if (!ud || ud.isBorder || ud.isBackground) continue
				if (!ud.mediaItem) continue
				this.updateMeshBorder(mesh, ud.mediaItem.id === id, group)
			}
		}
	}

	updateMeshBorder(mesh, isActive, group) {
		if (isActive) {
			if (!mesh.userData.border && this.gl) {
				const ts = mesh.userData.targetScale
				const maxScale = Math.max(ts.x, ts.y)
				const border = new Mesh(this.gl, {
					geometry: this.torusGeometry ?? undefined,
					program: this.borderProgram ?? undefined
				})
				border.position.set(mesh.position.x, mesh.position.y, mesh.position.z - 0.1)
				border.scale.set(maxScale, maxScale, maxScale)
				// @ts-expect-error - adding custom property
				border.userData = {isBorder: true, mainMesh: mesh, isRotating: true}
				border.setParent(group)
				mesh.userData.border = border
			}
		} else if (mesh.userData.border) {
			mesh.userData.border.setParent(null)
			delete mesh.userData.border
		}
	}

	queueChunk(cx, cy, cz) {
		const key = `${cx},${cy},${cz}`
		if (this.chunks.has(key)) return
		// Avoid duplicate queue entries
		if (this.chunkQueue.some((c) => c.key === key)) return
		this.chunkQueue.push({cx, cy, cz, key})
	}

	processChunkQueue() {
		const count = Math.min(this.chunkQueue.length, MAX_CHUNKS_PER_FRAME)
		for (let i = 0; i < count; i++) {
			const {cx, cy, cz, key} = this.chunkQueue.shift()
			if (this.chunks.has(key)) continue
			this.createChunk(cx, cy, cz)
		}
	}

	createChunk(cx, cy, cz) {
		const key = `${cx},${cy},${cz}`
		if (this.chunks.has(key)) return
		if (!this.gl || !this.scene) return

		const group = new Transform()
		// @ts-expect-error - adding custom property
		group.userData = {cx, cy, cz}
		group.setParent(this.scene)

		const planes = this.generateChunkPlanes(cx, cy, cz)
		const now = performance.now()
		for (let i = 0; i < planes.length; i++) {
			const plane = planes[i]
			const birthTime = now + i * ENTRANCE_STAGGER
			const mediaItem = this.media.length > 0 ? this.media[plane.mediaIndex % this.media.length] : null

			// Color background quad
			const mesh = new Mesh(this.gl, {geometry: this.planeGeometry ?? undefined, program: this.colorProgram})
			mesh.position.set(plane.position.x, plane.position.y, plane.position.z)
			mesh.scale.set(0.01, 0.01, 0.01)
			// @ts-expect-error - adding custom property
			mesh.userData = {
				isBorder: false,
				isBackground: true,
				mediaItem,
				birthTime,
				targetScale: {x: plane.scale.x, y: plane.scale.y, z: plane.scale.z}
			}
			mesh.setParent(group)

			// Textured image quad on top
			if (mediaItem?.url) {
				const texture = this.getTexture(mediaItem.url)
				const sharedProgram = /** @type {Program} */ (this.texturedProgram)
				const imgMesh = new Mesh(this.gl, {geometry: this.planeGeometry ?? undefined, program: sharedProgram})
				imgMesh.position.set(plane.position.x, plane.position.y, plane.position.z + 0.15)
				imgMesh.scale.set(0.01, 0.01, 0.01)
				// Swap texture on the shared program right before this mesh draws
				imgMesh.onBeforeRender(() => {
					sharedProgram.uniforms.tMap.value = texture
				})
				// @ts-expect-error - adding custom property
				imgMesh.userData = {
					isBorder: false,
					mediaItem,
					birthTime,
					texture,
					targetScale: {x: plane.scale.x * IMAGE_INSET, y: plane.scale.y * IMAGE_INSET, z: 1}
				}
				imgMesh.setParent(group)

				// Add rotating torus if this is the active channel
				if (mediaItem.id === this.activeId) {
					this.updateMeshBorder(imgMesh, true, group)
				}
			}
		}

		this.chunks.set(key, group)
		this.animatingChunks.add(key)
	}

	removeChunk(key) {
		const group = this.chunks.get(key)
		if (!group) return
		group.setParent(null)
		this.chunks.delete(key)
		this.animatingChunks.delete(key)
	}

	exitChunk(key) {
		const group = this.chunks.get(key)
		if (!group) return
		this.chunks.delete(key)
		this.animatingChunks.delete(key)

		const now = performance.now()
		let i = 0
		for (const mesh of group.children) {
			if (mesh.userData) {
				mesh.userData.exitTime = now + i * EXIT_STAGGER
				mesh.userData.birthTime = null
			}
			i++
		}
		this.exitingChunks.set(key, group)
	}

	updateChunks(force = false) {
		const cx = Math.floor(this.basePos.x / CHUNK_SIZE)
		const cy = Math.floor(this.basePos.y / CHUNK_SIZE)
		const cz = Math.floor(this.basePos.z / CHUNK_SIZE)

		const key = `${cx},${cy},${cz}`
		const now = performance.now()

		const isZooming = Math.abs(this.velocity.z) > 0.05
		const throttleMs = isZooming ? 400 : 100

		if (!force && key === this.lastChunkKey) return
		if (!force && now - this.lastChunkUpdate < throttleMs) return

		this.lastChunkKey = key
		this.lastChunkUpdate = now

		const neededChunks = new Set()
		for (const offset of CHUNK_OFFSETS) {
			const chunkKey = `${cx + offset.dx},${cy + offset.dy},${cz + offset.dz}`
			neededChunks.add(chunkKey)
			this.queueChunk(cx + offset.dx, cy + offset.dy, cz + offset.dz)
		}

		for (const [chunkKey] of this.chunks) {
			if (!neededChunks.has(chunkKey)) {
				this.exitChunk(chunkKey)
			}
		}

		// Also remove queued chunks that are no longer needed
		this.chunkQueue = this.chunkQueue.filter((c) => neededChunks.has(c.key))
	}

	animate() {
		if (this.disposed || !this.camera || !this.renderer) return

		if (this.keys.forward) this.targetVel.z -= KEYBOARD_SPEED
		if (this.keys.backward) this.targetVel.z += KEYBOARD_SPEED
		if (this.keys.left) this.targetVel.x -= KEYBOARD_SPEED
		if (this.keys.right) this.targetVel.x += KEYBOARD_SPEED
		if (this.keys.down) this.targetVel.y -= KEYBOARD_SPEED
		if (this.keys.up) this.targetVel.y += KEYBOARD_SPEED

		const isZooming = Math.abs(this.velocity.z) > 0.05
		const driftAmount = 8.0 * clamp(this.basePos.z / 50, 0.3, 2.0)
		const driftLerp = isZooming ? 0.2 : 0.12

		if (!this.isDragging) {
			this.drift.x = lerp(this.drift.x, this.mouse.x * driftAmount, driftLerp)
			this.drift.y = lerp(this.drift.y, this.mouse.y * driftAmount, driftLerp)
		}

		this.targetVel.z += this.scrollAccum
		this.scrollAccum *= 0.8

		for (const axis of ['x', 'y', 'z']) {
			this.targetVel[axis] = clamp(this.targetVel[axis], -MAX_VELOCITY, MAX_VELOCITY)
			this.velocity[axis] = lerp(this.velocity[axis], this.targetVel[axis], VELOCITY_LERP)
			this.basePos[axis] += this.velocity[axis]
			this.targetVel[axis] *= VELOCITY_DECAY
		}

		this.camera.position.set(this.basePos.x + this.drift.x, this.basePos.y + this.drift.y, this.basePos.z)

		// Update depth fade uniform for shaders
		const camZ = this.basePos.z
		if (this.colorProgram) this.colorProgram.uniforms.uCameraZ.value = camZ
		if (this.texturedProgram) this.texturedProgram.uniforms.uCameraZ.value = camZ

		this.updateChunks()
		this.processChunkQueue()
		this.animateEntrance()
		this.animateExits()
		this.updateVisibility()
		this.rotateBorders()
		this.renderer.render({scene: this.scene, camera: this.camera})

		this.animationId = requestAnimationFrame(() => this.animate())
	}

	animateEntrance() {
		if (this.animatingChunks.size === 0) return
		const now = performance.now()
		const duration = ENTRANCE_DURATION
		for (const key of this.animatingChunks) {
			const group = this.chunks.get(key)
			if (!group) {
				this.animatingChunks.delete(key)
				continue
			}
			let allDone = true
			for (const mesh of group.children) {
				const ud = mesh.userData
				if (!ud?.birthTime) continue
				const elapsed = now - ud.birthTime
				if (elapsed < 0) {
					allDone = false
					continue
				}
				const t = Math.min(elapsed / duration, 1)
				if (t >= 1) {
					mesh.scale.set(ud.targetScale.x, ud.targetScale.y, ud.targetScale.z)
					ud.birthTime = null
					continue
				}
				allDone = false
				const ease = 1 - (1 - t) ** 3
				mesh.scale.set(ud.targetScale.x * ease, ud.targetScale.y * ease, ud.targetScale.z * ease)
			}
			if (allDone) this.animatingChunks.delete(key)
		}
	}

	animateExits() {
		if (this.exitingChunks.size === 0) return
		const now = performance.now()
		for (const [key, group] of this.exitingChunks) {
			let allDone = true
			for (const mesh of group.children) {
				const ud = mesh.userData
				if (!ud?.exitTime) continue
				const elapsed = now - ud.exitTime
				if (elapsed < 0) {
					allDone = false
					continue
				}
				const t = Math.min(elapsed / EXIT_DURATION, 1)
				if (t >= 1) {
					mesh.scale.set(0, 0, 0)
					ud.exitTime = null
					continue
				}
				allDone = false
				const ease = 1 - t * t * t // ease-in cubic (shrink accelerates)
				const ts = ud.targetScale
				if (ts) {
					mesh.scale.set(ts.x * ease, ts.y * ease, ts.z * ease)
				}
			}
			if (allDone) {
				group.setParent(null)
				this.exitingChunks.delete(key)
			}
		}
	}

	updateVisibility() {
		if (!this.camera) return
		const camZ = this.camera.position.z
		for (const group of this.chunks.values()) {
			for (const mesh of group.children) {
				const ud = mesh.userData
				if (!ud) continue
				if (ud.isBorder) {
					if (ud.mainMesh) mesh.visible = ud.mainMesh.visible
					continue
				}
				// Don't cull meshes still animating entrance/exit
				if (ud.birthTime || ud.exitTime) continue
				const absDepth = Math.abs(mesh.position.z - camZ)
				mesh.visible = absDepth <= DEPTH_FADE_END
			}
		}
	}

	rotateBorders() {
		for (const group of this.chunks.values()) {
			for (const mesh of group.children) {
				if (mesh.userData?.isRotating) {
					mesh.rotation.x += 0.02
					mesh.rotation.y += 0.03
				}
			}
		}
	}

	setMedia(media) {
		this.media = media
		for (const key of this.chunks.keys()) this.removeChunk(key)
		for (const [, group] of this.exitingChunks) {
			group.setParent(null)
		}
		this.exitingChunks.clear()
		this.updateChunks(true)
	}

	dispose() {
		this.disposed = true
		if (this.animationId) cancelAnimationFrame(this.animationId)
		this.resizeObserver?.disconnect()

		for (const key of this.chunks.keys()) this.removeChunk(key)
		for (const [, group] of this.exitingChunks) {
			group.setParent(null)
		}
		this.exitingChunks.clear()
		for (const texture of this.textureCache.values()) {
			if (texture.texture && this.gl) this.gl.deleteTexture(texture.texture)
		}
		this.textureCache.clear()
		this.texturedProgram = null
		this.borderProgram = null
		this.planeCache.clear()
		this.planeGeometry = null
		this.torusGeometry = null
		if (this.gl) this.container.removeChild(this.gl.canvas)
		this.tooltip?.remove()
	}
}
