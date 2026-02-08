/**
 * WebGL infinite canvas with chunk-based rendering using OGL
 * Parallel implementation for bundle size and performance comparison
 */
import {Renderer, Camera, Transform, Mesh, Plane, Program, Texture, Vec3, Vec2} from 'ogl'

const CHUNK_SIZE = 110
const RENDER_DISTANCE = 2
const CHUNK_FADE_MARGIN = 1
const MAX_VELOCITY = 3.2
const DEPTH_FADE_START = 140
const DEPTH_FADE_END = 260
const INVIS_THRESHOLD = 0.01
const KEYBOARD_SPEED = 0.18
const VELOCITY_LERP = 0.16
const VELOCITY_DECAY = 0.9
const INITIAL_CAMERA_Z = 50
const ITEMS_PER_CHUNK = 5

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

// Vertex shader - transforms positions and passes UV coordinates
const vertexShader = `
	attribute vec3 position;
	attribute vec2 uv;

	uniform mat4 modelViewMatrix;
	uniform mat4 projectionMatrix;
	uniform mat3 normalMatrix;

	varying vec2 vUv;
	varying float vDepth;

	void main() {
		vUv = uv;
		vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
		vDepth = -mvPosition.z;
		gl_Position = projectionMatrix * mvPosition;
	}
`

// Fragment shader - samples texture, applies opacity and fog
const fragmentShader = `
	precision highp float;

	uniform sampler2D uTexture;
	uniform float uOpacity;
	uniform vec3 uFogColor;
	uniform float uFogNear;
	uniform float uFogFar;
	uniform bool uUseFog;

	varying vec2 vUv;
	varying float vDepth;

	void main() {
		vec4 texColor = texture2D(uTexture, vUv);

		float opacity = uOpacity;

		// Apply fog if enabled
		if (uUseFog) {
			float fogFactor = smoothstep(uFogNear, uFogFar, vDepth);
			texColor.rgb = mix(texColor.rgb, uFogColor, fogFactor);
			opacity *= (1.0 - fogFactor * 0.5);
		}

		gl_FragColor = vec4(texColor.rgb, texColor.a * opacity);
	}
`

export class InfiniteCanvasOGL {
	constructor(container, config = {}) {
		this.container = container
		this.media = config.media || []
		this.activeId = config.activeId
		this.accentColor = config.accentColor || '#ff0000'
		this.onProgress = config.onProgress
		this.onClick = config.onClick
		this.backgroundColor = config.backgroundColor ?? null
		this.fogColor = config.fogColor ?? null
		this.fogNear = config.fogNear || 120
		this.fogFar = config.fogFar || 320

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
		this.textureCache = new Map()
		this.planeCache = new Map()
		this.disposed = false
		this.hoveredItem = null

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
		this.gl.canvas.style.width = '100%'
		this.gl.canvas.style.height = '100%'
		this.container.appendChild(this.gl.canvas)

		// Set canvas size
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

		// Create shared plane geometry
		this.planeGeometry = new Plane(this.gl, {width: 1, height: 1})

		this.bindEvents()
		this.updateChunks(true)
		this.animate()
	}

	parseColor(color) {
		// Simple color parser for hex colors
		if (typeof color === 'string' && color.startsWith('#')) {
			const hex = color.slice(1)
			const r = parseInt(hex.slice(0, 2), 16) / 255
			const g = parseInt(hex.slice(2, 4), 16) / 255
			const b = parseInt(hex.slice(4, 6), 16) / 255
			return [r, g, b]
		}
		// Parse rgb/rgba
		if (typeof color === 'string' && color.startsWith('rgb')) {
			const match = color.match(/[\d.]+/g)
			if (match) {
				return [parseFloat(match[0]) / 255, parseFloat(match[1]) / 255, parseFloat(match[2]) / 255]
			}
		}
		return [0, 0, 0]
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
		// Convert screen coordinates to world ray
		const near = new Vec3(x, y, -1)
		const far = new Vec3(x, y, 1)

		// Unproject points
		const nearWorld = this.unproject(near)
		const farWorld = this.unproject(far)

		const direction = new Vec3()
		direction.sub(farWorld, nearWorld).normalize()

		return {origin: nearWorld, direction}
	}

	unproject(vec) {
		// Unproject screen space to world space
		if (!this.camera?.viewMatrix || !this.camera?.projectionMatrix) {
			throw new Error('Camera matrices not initialized')
		}
		const viewProjectionInverse = new Float32Array(16)
		const viewMatrix = this.camera.viewMatrix
		const projectionMatrix = this.camera.projectionMatrix

		// Multiply projection * view
		const viewProjection = new Float32Array(16)
		this.multiplyMatrices(viewProjection, projectionMatrix, viewMatrix)

		// Invert
		this.invertMatrix(viewProjectionInverse, viewProjection)

		// Transform vector
		const w = 1.0 / (viewProjectionInverse[3] * vec.x + viewProjectionInverse[7] * vec.y + viewProjectionInverse[11] * vec.z + viewProjectionInverse[15])

		const result = new Vec3()
		result.x = (viewProjectionInverse[0] * vec.x + viewProjectionInverse[4] * vec.y + viewProjectionInverse[8] * vec.z + viewProjectionInverse[12]) * w
		result.y = (viewProjectionInverse[1] * vec.x + viewProjectionInverse[5] * vec.y + viewProjectionInverse[9] * vec.z + viewProjectionInverse[13]) * w
		result.z = (viewProjectionInverse[2] * vec.x + viewProjectionInverse[6] * vec.y + viewProjectionInverse[10] * vec.z + viewProjectionInverse[14]) * w

		return result
	}

	multiplyMatrices(out, a, b) {
		const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3]
		const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7]
		const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11]
		const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15]

		let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3]
		out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
		out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
		out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
		out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

		b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7]
		out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
		out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
		out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
		out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

		b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11]
		out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
		out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
		out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
		out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

		b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15]
		out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
		out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
		out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
		out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
	}

	invertMatrix(out, a) {
		const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3]
		const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7]
		const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11]
		const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15]

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
		// Plane is facing forward (normal is 0, 0, 1 in local space)
		// Transform to world space
		const worldPos = mesh.worldPosition
		const planeNormal = new Vec3(0, 0, 1)

		// Calculate intersection
		const denom = ray.direction.dot(planeNormal)
		if (Math.abs(denom) < 0.0001) return null

		const toPlane = new Vec3()
		toPlane.sub(worldPos, ray.origin)
		const t = toPlane.dot(planeNormal) / denom
		if (t < 0) return null

		const point = new Vec3()
		point.copy(ray.direction).multiply(t).add(ray.origin)

		// Check if point is within plane bounds
		const localPoint = new Vec3()
		localPoint.sub(point, worldPos)

		const halfWidth = mesh.scale.x * 0.5
		const halfHeight = mesh.scale.y * 0.5

		if (Math.abs(localPoint.x) <= halfWidth && Math.abs(localPoint.y) <= halfHeight) {
			return {distance: t, point}
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

	getTexture(item) {
		const key = item.url
		if (this.textureCache.has(key)) return this.textureCache.get(key)
		if (!this.gl) throw new Error('WebGL not initialized')

		const texture = new Texture(this.gl, {
			generateMipmaps: true,
			minFilter: this.gl.LINEAR_MIPMAP_LINEAR,
			magFilter: this.gl.LINEAR,
			wrapS: this.gl.CLAMP_TO_EDGE,
			wrapT: this.gl.CLAMP_TO_EDGE
		})

		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.onload = () => {
			texture.image = img
		}
		img.onerror = (err) => console.error('Texture load failed:', key, err)
		img.src = key

		this.textureCache.set(key, texture)
		return texture
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

	setActiveId(id) {
		if (this.activeId === id) return
		this.activeId = id
		// Update existing meshes - border animation not implemented in Phase 1
	}

	setAccentColor(color) {
		this.accentColor = color
	}

	createChunk(cx, cy, cz) {
		const key = `${cx},${cy},${cz}`
		if (this.chunks.has(key)) return
		if (!this.gl) return

		const group = new Transform()
		// Store chunk coordinates separately since Transform doesn't have userData
		// @ts-ignore - adding custom property
		group.userData = {cx, cy, cz}
		group.setParent(this.scene)

		const planes = this.generateChunkPlanes(cx, cy, cz)
		for (const plane of planes) {
			if (!this.media.length) continue

			const mediaItem = this.media[plane.mediaIndex % this.media.length]
			const texture = this.getTexture(mediaItem)

			const fogColorParsed = this.fogColor ? this.parseColor(this.fogColor) : [0, 0, 0]

			const program = new Program(this.gl, {
				vertex: vertexShader,
				fragment: fragmentShader,
				uniforms: {
					uTexture: {value: texture},
					uOpacity: {value: 0},
					uFogColor: {value: fogColorParsed},
					uFogNear: {value: this.fogNear},
					uFogFar: {value: this.fogFar},
					uUseFog: {value: !!this.fogColor}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false
			})

			const mesh = new Mesh(this.gl, {geometry: this.planeGeometry, program})
			mesh.position.set(plane.position.x, plane.position.y, plane.position.z)

			// Scale based on media aspect ratio if available
			if (mediaItem.width && mediaItem.height) {
				const aspect = mediaItem.width / mediaItem.height
				mesh.scale.set(plane.scale.y * aspect, plane.scale.y, 1)
			} else {
				mesh.scale.set(plane.scale.x, plane.scale.y, plane.scale.z)
			}

			// @ts-ignore - adding custom property
			mesh.userData = {targetOpacity: 1, chunkCx: cx, chunkCy: cy, chunkCz: cz, mediaItem}
			mesh.visible = false
			mesh.setParent(group)
		}

		this.chunks.set(key, group)
	}

	removeChunk(key) {
		const group = this.chunks.get(key)
		if (!group || !this.gl) return

		// Clean up meshes
		for (const child of group.children) {
			// @ts-ignore - we know these are Mesh instances
			if (child.program) {
				// Dispose program
				const gl = this.gl
				// @ts-ignore - accessing program property
				if (child.program.program) {
					// @ts-ignore - accessing program property
					gl.deleteProgram(child.program.program)
				}
			}
		}

		group.setParent(null)
		this.chunks.delete(key)
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
			this.createChunk(cx + offset.dx, cy + offset.dy, cz + offset.dz)
		}

		for (const [chunkKey] of this.chunks) {
			if (!neededChunks.has(chunkKey)) {
				this.removeChunk(chunkKey)
			}
		}
	}

	updatePlaneOpacities() {
		const camZ = this.camera.position.z
		const cx = Math.floor(this.basePos.x / CHUNK_SIZE)
		const cy = Math.floor(this.basePos.y / CHUNK_SIZE)
		const cz = Math.floor(this.basePos.z / CHUNK_SIZE)
		const depthRange = DEPTH_FADE_END - DEPTH_FADE_START || 0.0001

		for (const [, group] of this.chunks) {
			// @ts-ignore - custom property
			const {cx: chunkCx, cy: chunkCy, cz: chunkCz} = group.userData
			const dist = Math.max(Math.abs(chunkCx - cx), Math.abs(chunkCy - cy), Math.abs(chunkCz - cz))
			const gridFade =
				dist <= RENDER_DISTANCE ? 1 : Math.max(0, 1 - (dist - RENDER_DISTANCE) / (CHUNK_FADE_MARGIN || 0.0001))

			for (const mesh of group.children) {
				// @ts-ignore - we know these are Mesh instances with program
				if (!mesh.program) continue

				const absDepth = Math.abs(mesh.worldPosition.z - camZ)

				if (absDepth > DEPTH_FADE_END + 50) {
					mesh.program.uniforms.uOpacity.value = 0
					mesh.visible = false
					continue
				}

				const depthFade = absDepth <= DEPTH_FADE_START ? 1 : Math.max(0, 1 - (absDepth - DEPTH_FADE_START) / depthRange)
				const target = Math.min(gridFade, depthFade * depthFade)
				// @ts-ignore - we know program exists
				const current = mesh.program.uniforms.uOpacity.value
				const newOpacity = target < INVIS_THRESHOLD && current < INVIS_THRESHOLD ? 0 : lerp(current, target, 0.18)

				// @ts-ignore - we know program exists
				mesh.program.uniforms.uOpacity.value = newOpacity > 0.99 ? 1 : newOpacity
				mesh.visible = newOpacity > INVIS_THRESHOLD
			}
		}
	}

	animate() {
		if (this.disposed) return

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

		this.updateChunks()
		this.updatePlaneOpacities()
		this.renderer.render({scene: this.scene, camera: this.camera})

		this.animationId = requestAnimationFrame(() => this.animate())
	}

	setMedia(media) {
		this.media = media
		for (const key of this.chunks.keys()) this.removeChunk(key)
		this.updateChunks(true)
	}

	dispose() {
		this.disposed = true
		if (this.animationId) cancelAnimationFrame(this.animationId)
		this.resizeObserver?.disconnect()

		for (const key of this.chunks.keys()) this.removeChunk(key)
		for (const texture of this.textureCache.values()) {
			if (texture.texture) this.gl.deleteTexture(texture.texture)
		}

		this.textureCache.clear()
		this.planeCache.clear()
		this.planeGeometry = null
		this.container.removeChild(this.gl.canvas)
		this.tooltip?.remove()
	}
}
