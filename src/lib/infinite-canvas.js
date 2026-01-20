/**
 * WebGL infinite canvas with chunk-based rendering
 * Inspired by edoardolunardi/infinite-canvas
 */
import * as THREE from 'three'

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

export class InfiniteCanvas {
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

		this.scene = new THREE.Scene()
		this.scene.background = this.backgroundColor ? new THREE.Color(this.backgroundColor) : null
		if (this.fogColor) {
			this.scene.fog = new THREE.Fog(this.fogColor, this.fogNear, this.fogFar)
		}

		this.camera = new THREE.PerspectiveCamera(60, width / height, 1, 500)
		this.camera.position.set(0, 0, INITIAL_CAMERA_Z)

		this.renderer = new THREE.WebGLRenderer({antialias: false, powerPreference: 'high-performance', alpha: true})
		this.renderer.setSize(width, height)
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
		this.container.appendChild(this.renderer.domElement)

		this.planeGeometry = new THREE.PlaneGeometry(1, 1)
		// Radius 0.75 to fit around 1x1 plane (0.5 radius), tube 0.02
		this.torusGeometry = new THREE.TorusGeometry(0.75, 0.015, 8, 64)
		this.textureLoader = new THREE.TextureLoader()
		this.raycaster = new THREE.Raycaster()

		this.borderMaterial = new THREE.MeshBasicMaterial({
			color: this.accentColor,
			transparent: true,
			opacity: 0,
			side: THREE.DoubleSide
		})

		this.bindEvents()
		this.updateChunks(true)
		this.animate()
	}

	bindEvents() {
		const canvas = this.renderer.domElement
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
				lastTouches = Array.from(e.touches)
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
				const touches = Array.from(e.touches)
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
				lastTouches = Array.from(e.touches)
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
		if (this.isDragging) {
			this.tooltip.style.opacity = '0'
			return
		}

		const rect = this.renderer.domElement.getBoundingClientRect()
		const mouse = new THREE.Vector2(
			((e.clientX - rect.left) / rect.width) * 2 - 1,
			-((e.clientY - rect.top) / rect.height) * 2 + 1
		)
		this.raycaster.setFromCamera(mouse, this.camera)

		const meshes = []
		for (const group of this.chunks.values()) {
			for (const mesh of group.children) {
				if (mesh.visible) meshes.push(mesh)
			}
		}

		const intersects = this.raycaster.intersectObjects(meshes)
		if (intersects.length > 0) {
			const mediaItem = intersects[0].object.userData.mediaItem
			if (mediaItem && mediaItem !== this.hoveredItem) {
				this.hoveredItem = mediaItem
				const name = mediaItem.name || mediaItem.title || mediaItem.slug || ''
				this.tooltip.textContent = name
			}
			this.tooltip.style.opacity = '1'
			this.tooltip.style.left = `${e.clientX - rect.left + 12}px`
			this.tooltip.style.top = `${e.clientY - rect.top + 12}px`
			this.renderer.domElement.style.cursor = 'pointer'
		} else {
			this.tooltip.style.opacity = '0'
			this.hoveredItem = null
			this.renderer.domElement.style.cursor = this.isDragging ? 'grabbing' : 'grab'
		}
	}

	handleClick(e) {
		const rect = this.renderer.domElement.getBoundingClientRect()
		const mouse = new THREE.Vector2(
			((e.clientX - rect.left) / rect.width) * 2 - 1,
			-((e.clientY - rect.top) / rect.height) * 2 + 1
		)
		this.raycaster.setFromCamera(mouse, this.camera)

		const meshes = []
		for (const group of this.chunks.values()) {
			for (const mesh of group.children) {
				if (mesh.visible) meshes.push(mesh)
			}
		}

		const intersects = this.raycaster.intersectObjects(meshes)
		if (intersects.length > 0) {
			const mediaItem = intersects[0].object.userData.mediaItem
			if (mediaItem) this.onClick(mediaItem)
		}
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
		if (this.disposed) return
		const width = this.container.clientWidth
		const height = this.container.clientHeight
		this.camera.aspect = width / height
		this.camera.updateProjectionMatrix()
		this.renderer.setSize(width, height)
	}

	getTexture(item) {
		const key = item.url
		if (this.textureCache.has(key)) return this.textureCache.get(key)

		const texture = this.textureLoader.load(
			key,
			(tex) => {
				tex.minFilter = THREE.LinearMipmapLinearFilter
				tex.magFilter = THREE.LinearFilter
				tex.generateMipmaps = true
				tex.anisotropy = 4
				tex.colorSpace = THREE.SRGBColorSpace
				tex.needsUpdate = true
			},
			undefined,
			(err) => console.error('Texture load failed:', key, err)
		)
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
				position: new THREE.Vector3(
					cx * CHUNK_SIZE + r(0) * CHUNK_SIZE,
					cy * CHUNK_SIZE + r(1) * CHUNK_SIZE,
					cz * CHUNK_SIZE + r(2) * CHUNK_SIZE
				),
				scale: new THREE.Vector3(size, size, 1),
				mediaIndex: Math.floor(r(5) * 1_000_000)
			})
		}

		this.planeCache.set(key, planes)
		return planes
	}

	setActiveId(id) {
		if (this.activeId === id) return
		this.activeId = id
		// Update existing meshes
		for (const group of this.chunks.values()) {
			for (const mesh of group.children) {
				if (mesh.userData.isBorder) continue
				const isActive = mesh.userData.mediaItem?.id === this.activeId
				this.updateMeshBorder(mesh, isActive, group)
			}
		}
	}

	setAccentColor(color) {
		this.accentColor = color
		this.borderMaterial.color.set(color)
		for (const group of this.chunks.values()) {
			for (const mesh of group.children) {
				if (mesh.userData.isBorder) {
					mesh.material.color.set(color)
				}
			}
		}
	}

	updateMeshBorder(mesh, isActive, group) {
		if (isActive) {
			if (!mesh.userData.border) {
				// Scale torus to fit the largest dimension of the mesh
				const maxScale = Math.max(mesh.scale.x, mesh.scale.y)
				const border = new THREE.Mesh(this.torusGeometry, this.borderMaterial.clone())
				border.position.copy(mesh.position)
				// border.position.z -= 0.05 // Keep it centered or slightly behind?
				// For a 3D rotating ring, centering usually looks best, maybe slightly behind to avoid clipping if flat
				border.position.z -= 0.1

				// Scale the torus to match the mesh size
				border.scale.setScalar(maxScale)
				// border.scale.multiplyScalar(1.0)

				border.userData = {isBorder: true, mainMesh: mesh, isRotating: true}
				group.add(border)
				mesh.userData.border = border
			}
		} else if (mesh.userData.border) {
			group.remove(mesh.userData.border)
			mesh.userData.border.material.dispose()
			delete mesh.userData.border
		}
	}

	createChunk(cx, cy, cz) {
		const key = `${cx},${cy},${cz}`
		if (this.chunks.has(key)) return

		const group = new THREE.Group()
		group.userData = {cx, cy, cz}

		const planes = this.generateChunkPlanes(cx, cy, cz)
		for (const plane of planes) {
			if (!this.media.length) continue

			const mediaItem = this.media[plane.mediaIndex % this.media.length]
			const texture = this.getTexture(mediaItem)

			const material = new THREE.MeshBasicMaterial({
				map: texture,
				transparent: true,
				opacity: 0,
				side: THREE.DoubleSide
			})

			const mesh = new THREE.Mesh(this.planeGeometry, material)
			mesh.position.copy(plane.position)

			// Scale based on media aspect ratio if available
			if (mediaItem.width && mediaItem.height) {
				const aspect = mediaItem.width / mediaItem.height
				mesh.scale.set(plane.scale.y * aspect, plane.scale.y, 1)
			} else {
				mesh.scale.copy(plane.scale)
			}

			mesh.userData = {targetOpacity: 1, chunkCx: cx, chunkCy: cy, chunkCz: cz, mediaItem}
			mesh.visible = false
			group.add(mesh)

			// Add border if active
			if (mediaItem.id === this.activeId) {
				this.updateMeshBorder(mesh, true, group)
			}
		}

		this.scene.add(group)
		this.chunks.set(key, group)
	}

	removeChunk(key) {
		const group = this.chunks.get(key)
		if (!group) return

		group.traverse((child) => {
			if (child.material) child.material.dispose()
		})
		this.scene.remove(group)
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
			const {cx: chunkCx, cy: chunkCy, cz: chunkCz} = group.userData
			const dist = Math.max(Math.abs(chunkCx - cx), Math.abs(chunkCy - cy), Math.abs(chunkCz - cz))
			const gridFade =
				dist <= RENDER_DISTANCE ? 1 : Math.max(0, 1 - (dist - RENDER_DISTANCE) / (CHUNK_FADE_MARGIN || 0.0001))

			for (const mesh of group.children) {
				// Rotate borders
				if (mesh.userData.isRotating) {
					mesh.rotation.x += 0.02
					mesh.rotation.y += 0.03
				}

				if (mesh.userData.isBorder) continue

				const absDepth = Math.abs((mesh.userData.mainMesh?.position.z || mesh.position.z) - camZ)

				if (absDepth > DEPTH_FADE_END + 50) {
					mesh.material.opacity = 0
					mesh.visible = false
					continue
				}

				const depthFade = absDepth <= DEPTH_FADE_START ? 1 : Math.max(0, 1 - (absDepth - DEPTH_FADE_START) / depthRange)
				const target = Math.min(gridFade, depthFade * depthFade)
				const current = mesh.material.opacity
				const newOpacity = target < INVIS_THRESHOLD && current < INVIS_THRESHOLD ? 0 : lerp(current, target, 0.18)

				mesh.material.opacity = newOpacity > 0.99 ? 1 : newOpacity
				mesh.material.depthWrite = newOpacity > 0.99
				mesh.visible = newOpacity > INVIS_THRESHOLD

				if (mesh.userData.border) {
					mesh.userData.border.material.opacity = mesh.material.opacity
					mesh.userData.border.visible = mesh.visible
				}
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
		this.renderer.render(this.scene, this.camera)

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
		for (const texture of this.textureCache.values()) texture.dispose()

		this.textureCache.clear()
		this.planeCache.clear()
		this.planeGeometry.dispose()
		this.renderer.dispose()
		this.container.removeChild(this.renderer.domElement)
		this.tooltip?.remove()
	}
}
