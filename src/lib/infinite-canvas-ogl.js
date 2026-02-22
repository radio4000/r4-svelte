/**
 * WebGL infinite canvas with chunk-based rendering using OGL
 * Parallel implementation for bundle size and performance comparison
 */
import {Renderer, Camera, Transform, Mesh, Plane, Program, Texture, Vec3} from 'ogl'
import {
	resolveChannelCardStates,
	buildChannelInfoCanvas,
	resolveChannelInfoClickTarget,
	CHANNEL_INFO_CANVAS
} from '$lib/3d/channel-card-3d.js'

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

const colorVertexShader = `
	attribute vec3 position;
	attribute vec2 uv;
	uniform mat4 modelViewMatrix;
	uniform mat4 projectionMatrix;
	varying vec2 vUv;
	varying float vDepthFade;
	void main() {
		vUv = uv;
		vDepthFade = 1.0;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

const colorFragmentShader = `
	precision highp float;
	uniform vec3 uColor;
	uniform float uAlpha;
	uniform float uCornerRadius;
	uniform vec3 uStrokeColor;
	uniform float uStrokeThickness;
	uniform float uStrokeAlpha;
	varying vec2 vUv;
	varying float vDepthFade;

	float roundedRectSDF(vec2 p, vec2 b, float r) {
		vec2 q = abs(p) - b + vec2(r);
		return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
	}
	void main() {
		if (vDepthFade < 0.01) discard;
		float radius = clamp(uCornerRadius, 0.0, 0.49);
		float strokeT = clamp(uStrokeThickness, 0.0, 0.2);
		// Keep AA constant to avoid WebGL derivative extension requirements.
		float aa = 0.0035;
		if (radius > 0.0) {
			vec2 p = vUv - vec2(0.5);
			float outer = roundedRectSDF(p, vec2(0.5), radius);
			if (outer > 0.0) discard;
			vec4 fill = vec4(uColor, uAlpha * vDepthFade);
			if (strokeT <= 0.0001 || uStrokeAlpha <= 0.001) {
				gl_FragColor = fill;
				return;
			}
			float innerR = max(radius - strokeT, 0.0);
			float inner = roundedRectSDF(p, vec2(0.5 - strokeT), innerR);
			float strokeMask = smoothstep(aa, -aa, outer) - smoothstep(aa, -aa, inner);
			vec4 stroke = vec4(uStrokeColor, uStrokeAlpha * vDepthFade * strokeMask);
			gl_FragColor = mix(fill, stroke, stroke.a);
			return;
		}
		gl_FragColor = vec4(uColor, uAlpha * vDepthFade);
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
	uniform float uCornerRadius;
	varying vec2 vUv;
	varying float vDepthFade;

	float roundedRectSDF(vec2 p, vec2 b, float r) {
		vec2 q = abs(p) - b + vec2(r);
		return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
	}
	void main() {
		if (vDepthFade < 0.01) discard;
		float radius = clamp(uCornerRadius, 0.0, 0.49);
		if (radius > 0.0) {
			vec2 p = vUv - vec2(0.5);
			float d = roundedRectSDF(p, vec2(0.5), radius);
			if (d > 0.0) discard;
		}
		vec4 color = texture2D(tMap, vUv);
		if (color.a < 0.01) discard;
		gl_FragColor = vec4(color.rgb, color.a * vDepthFade);
	}
`

const infoFragmentShader = `
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
	attribute vec2 uv;
	uniform mat4 modelViewMatrix;
	uniform mat4 projectionMatrix;
	varying vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

const borderFragmentShader = `
	precision highp float;
	uniform vec3 uColor;
	uniform float uShape;
	uniform float uThickness;
	uniform float uCornerRadius;
	uniform float uAlpha;
	varying vec2 vUv;

	float roundedRectSDF(vec2 p, vec2 b, float r) {
		vec2 q = abs(p) - b + vec2(r);
		return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
	}

	void main() {
		vec2 p = vUv - vec2(0.5);
		float aa = fwidth(p.x) + fwidth(p.y);
		float t = clamp(uThickness, 0.001, 0.2);
		float r = clamp(uCornerRadius, 0.0, 0.49);

		// Rounded-rect ring: outer mask minus inner mask.
		float outer = roundedRectSDF(p, vec2(0.5), r);
		float innerR = max(r - t, 0.0);
		float inner = roundedRectSDF(p, vec2(0.5 - t), innerR);
		float maskRounded = smoothstep(aa, -aa, outer) - smoothstep(aa, -aa, inner);

		// Circle fallback ring (kept for uShape compatibility).
		float outerC = length(p) - 0.5;
		float innerC = length(p) - max(0.5 - t, 0.0);
		float maskCircle = smoothstep(aa, -aa, outerC) - smoothstep(aa, -aa, innerC);

		float mask = mix(maskCircle, maskRounded, step(0.5, uShape));
		if (mask <= 0.001) discard;
		gl_FragColor = vec4(uColor, uAlpha * mask);
	}
`

const ENTRANCE_DURATION = 900
const EXIT_DURATION = 500
const ENTRANCE_STAGGER = 80
const EXIT_STAGGER = 40
const IMAGE_INSET = 0.88
const IMAGE_Z_OFFSET = 0.56
const INFO_Z_OFFSET = 0.3
const BEZEL_BACK_Z_OFFSET = -0.26
const BEZEL_BACK_SCALE = 1.05
const MAX_CHUNKS_PER_FRAME = 4
const SINGLE_SCENE_KEY = '__single__'

export class InfiniteCanvasOGL {
	constructor(container, config = {}) {
		this.container = container
		this.media = config.media || []
		this.activeId = config.activeId
		this.activeIds = new Set(
			Array.isArray(config.activeIds) ? config.activeIds.filter(Boolean) : config.activeId ? [config.activeId] : []
		)
		this.selectedId = config.selectedId ?? null
		this.liveBorderColor = config.liveBorderColor || '#ff0000'
		this.activeBorderColor = config.activeBorderColor || '#888'
		this.hoverBorderColor = config.hoverBorderColor || this.activeBorderColor
		this.favoriteBorderColor = config.favoriteBorderColor || '#ff0000'
		this.selectedBorderColor = config.selectedBorderColor || '#ffffff'
		this.defaultCardColor = config.defaultCardColor || '#ddd'
		this.selectedCardColor = config.selectedCardColor || this.defaultCardColor
		this.favoriteCardColor = config.favoriteCardColor || '#eee'
		this.activeCardColor = config.activeCardColor || '#eee'
		this.playingCardColor = config.playingCardColor || this.activeCardColor
		this.liveCardColor = config.liveCardColor || this.activeCardColor
		this.infoBgColor = config.infoBgColor || '#111'
		this.infoTextColor = config.infoTextColor || '#fff'
		this.infoMutedColor = config.infoMutedColor || '#bbb'
		this.tagBgColor = config.tagBgColor || '#ddd'
		this.tagTextColor = config.tagTextColor || this.infoTextColor
		this.tagHoverBgColor = config.tagHoverBgColor || this.tagBgColor
		this.tagHoverBorderColor = config.tagHoverBorderColor || this.hoverBorderColor
		this.tagActiveBgColor = config.tagActiveBgColor || this.activeCardColor
		this.tagActiveTextColor = config.tagActiveTextColor || this.infoTextColor
		this.tagActiveBorderColor = config.tagActiveBorderColor || this.activeBorderColor
		this.infoBorderColor = config.infoBorderColor || '#666'
		this.activeInfoTextColor = config.activeInfoTextColor || this.infoTextColor
		this.activeInfoMutedColor = config.activeInfoMutedColor || this.infoMutedColor
		this.liveBadgeBgColor = config.liveBadgeBgColor || this.liveBorderColor
		this.liveBadgeTextColor = config.liveBadgeTextColor || '#fff'
		this.tagBadgeColor = config.tagBadgeColor || this.liveBadgeBgColor
		this.roundArtworks = config.roundArtworks ?? true
		this.cornerRadius = config.cornerRadius ?? 0.12
		this.useRoundedBezel = this.roundArtworks && this.cornerRadius > 0.001
		this.onClick = config.onClick
		this.onNavigate = config.onNavigate
		this.backgroundColor = config.backgroundColor ?? null
		this.sceneMode = config.sceneMode === 'single' ? 'single' : 'infinite'
		this.disableNavigation = config.disableNavigation ?? this.sceneMode === 'single'
		this.enableCardTilt = config.enableCardTilt ?? this.sceneMode === 'single'
		this.singleCardSize = Number.isFinite(config.singleCardSize) ? Number(config.singleCardSize) : 18
		this.tiltAmount = Number.isFinite(config.tiltAmount) ? Number(config.tiltAmount) : 2.8
		this.singleSceneConstrainMovement = config.singleSceneConstrainMovement ?? true
		this.singleSceneMaxXY = Number.isFinite(config.singleSceneMaxXY) ? Number(config.singleSceneMaxXY) : null
		this.singleSceneCardDragRotate = config.singleSceneCardDragRotate ?? false
		this.singleSceneCardRotateSensitivity = Number.isFinite(config.singleSceneCardRotateSensitivity)
			? Number(config.singleSceneCardRotateSensitivity)
			: 0.006
		this.singleSceneMouseDrift = config.singleSceneMouseDrift ?? true
		this.cardDepthScale = Number.isFinite(config.cardDepthScale) ? Number(config.cardDepthScale) : 1
		this.cardSizeScale = Number.isFinite(config.cardSizeScale) ? Number(config.cardSizeScale) : 1
		this.minCameraZ = Number.isFinite(config.minCameraZ) ? Number(config.minCameraZ) : null
		this.maxCameraZ = Number.isFinite(config.maxCameraZ) ? Number(config.maxCameraZ) : null

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
		this.infoTextureCache = new Map()
		this.backgroundProgramCache = new Map()
		this.tagBadgeTexture = null
		this.liveBadgeTexture = null
		this.disposed = false
		this.hoveredItem = null
		this.hoveredId = null
		this.infoHoverTarget = null
		this.singlePointer = vec2()
		this.singleCardRotation = vec2()
		this.singleCardRotationTarget = vec2()
		this.isSingleCardRotating = false
		this.singleCardRotateDistance = 0
		this.ctrlPanPressed = false
		this.forcePanMode = false
		this.skipClickOnce = false
		this.cleanupFns = []

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
		this.borderGeometry = new Plane(this.gl, {width: 1, height: 1})

		// 1x1 canvas placeholder avoids "Alpha-premult and y-flip deprecated" warnings
		// that fire when OGL uploads a typed-array default texture
		this._placeholder = document.createElement('canvas')
		this._placeholder.width = 1
		this._placeholder.height = 1

		// Shared programs for "card" backgrounds by state
		this.colorPrograms = {
			default: new Program(this.gl, {
				vertex: colorVertexShader,
				fragment: colorFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.defaultCardColor)},
					uAlpha: {value: 0.95},
					uCornerRadius: {value: this.cornerRadius},
					uStrokeColor: {value: this.parseColor(this.activeBorderColor)},
					uStrokeThickness: {value: 0.0},
					uStrokeAlpha: {value: 0.0}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false
			}),
			favorite: new Program(this.gl, {
				vertex: colorVertexShader,
				fragment: colorFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.favoriteCardColor)},
					uAlpha: {value: 0.96},
					uCornerRadius: {value: this.cornerRadius},
					uStrokeColor: {value: this.parseColor(this.activeBorderColor)},
					uStrokeThickness: {value: 0.0},
					uStrokeAlpha: {value: 0.0}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false
			}),
			active: new Program(this.gl, {
				vertex: colorVertexShader,
				fragment: colorFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.activeCardColor)},
					uAlpha: {value: 0.98},
					uCornerRadius: {value: this.cornerRadius},
					uStrokeColor: {value: this.parseColor(this.activeBorderColor)},
					uStrokeThickness: {value: 0.0},
					uStrokeAlpha: {value: 0.0}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false
			}),
			hover: new Program(this.gl, {
				vertex: colorVertexShader,
				fragment: colorFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.selectedCardColor)},
					uAlpha: {value: 0.98},
					uCornerRadius: {value: this.cornerRadius},
					uStrokeColor: {value: this.parseColor(this.activeBorderColor)},
					uStrokeThickness: {value: 0.0},
					uStrokeAlpha: {value: 0.0}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false
			}),
			playing: new Program(this.gl, {
				vertex: colorVertexShader,
				fragment: colorFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.playingCardColor)},
					uAlpha: {value: 0.99},
					uCornerRadius: {value: this.cornerRadius},
					uStrokeColor: {value: this.parseColor(this.activeBorderColor)},
					uStrokeThickness: {value: 0.0},
					uStrokeAlpha: {value: 0.0}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false
			}),
			live: new Program(this.gl, {
				vertex: colorVertexShader,
				fragment: colorFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.liveCardColor)},
					uAlpha: {value: 0.99},
					uCornerRadius: {value: this.cornerRadius},
					uStrokeColor: {value: this.parseColor(this.activeBorderColor)},
					uStrokeThickness: {value: 0.0},
					uStrokeAlpha: {value: 0.0}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false
			}),
			selected: new Program(this.gl, {
				vertex: colorVertexShader,
				fragment: colorFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.selectedCardColor)},
					uAlpha: {value: 0.98},
					uCornerRadius: {value: this.cornerRadius},
					uStrokeColor: {value: this.parseColor(this.activeBorderColor)},
					uStrokeThickness: {value: 0.0},
					uStrokeAlpha: {value: 0.0}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false
			})
		}

		// Shared program for textured quads — compiled once, texture swapped per-mesh
		this.texturedProgram = new Program(this.gl, {
			vertex: texturedVertexShader,
			fragment: texturedFragmentShader,
			uniforms: {
				tMap: {value: new Texture(this.gl, {image: this._placeholder, generateMipmaps: false})},
				uCornerRadius: {value: this.cornerRadius},
				uCameraZ: {value: INITIAL_CAMERA_Z}
			},
			transparent: true,
			depthTest: true,
			depthWrite: false
		})

		this.infoProgram = new Program(this.gl, {
			vertex: texturedVertexShader,
			fragment: infoFragmentShader,
			uniforms: {
				tMap: {value: new Texture(this.gl, {image: this._placeholder, generateMipmaps: false})},
				uCameraZ: {value: INITIAL_CAMERA_Z}
			},
			transparent: true,
			depthTest: true,
			depthWrite: false
		})

		// Border programs per item state
		this.borderPrograms = {
			default: new Program(this.gl, {
				vertex: borderVertexShader,
				fragment: borderFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.activeBorderColor)},
					uShape: {value: 1},
					uThickness: {value: 0.013},
					uCornerRadius: {value: this.cornerRadius},
					uAlpha: {value: 0.38}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false,
				cullFace: null
			}),
			active: new Program(this.gl, {
				vertex: borderVertexShader,
				fragment: borderFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.activeBorderColor)},
					uShape: {value: 1},
					uThickness: {value: 0.016},
					uCornerRadius: {value: this.cornerRadius},
					uAlpha: {value: 1}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false,
				cullFace: null
			}),
			favorite: new Program(this.gl, {
				vertex: borderVertexShader,
				fragment: borderFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.favoriteBorderColor)},
					uShape: {value: 1},
					uThickness: {value: 0.015},
					uCornerRadius: {value: this.cornerRadius},
					uAlpha: {value: 1}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false,
				cullFace: null
			}),
			live: new Program(this.gl, {
				vertex: borderVertexShader,
				fragment: borderFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.liveBorderColor)},
					uShape: {value: 1},
					uThickness: {value: 0.019},
					uCornerRadius: {value: this.cornerRadius},
					uAlpha: {value: 1}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false,
				cullFace: null
			}),
			selected: new Program(this.gl, {
				vertex: borderVertexShader,
				fragment: borderFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.selectedBorderColor)},
					uShape: {value: 1},
					uThickness: {value: 0.017},
					uCornerRadius: {value: this.cornerRadius},
					uAlpha: {value: 1}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false,
				cullFace: null
			}),
			hover: new Program(this.gl, {
				vertex: borderVertexShader,
				fragment: borderFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.hoverBorderColor)},
					uShape: {value: 1},
					uThickness: {value: 0.014},
					uCornerRadius: {value: this.cornerRadius},
					uAlpha: {value: 1}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false,
				cullFace: null
			})
		}

		// Subtle depth layer behind the primary border for visual "volume"
		this.borderBackPrograms = {
			active: new Program(this.gl, {
				vertex: borderVertexShader,
				fragment: borderFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.activeBorderColor)},
					uShape: {value: 1},
					uThickness: {value: 0.032},
					uCornerRadius: {value: this.cornerRadius},
					uAlpha: {value: 0.34}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false,
				cullFace: null
			}),
			favorite: new Program(this.gl, {
				vertex: borderVertexShader,
				fragment: borderFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.favoriteBorderColor)},
					uShape: {value: 1},
					uThickness: {value: 0.03},
					uCornerRadius: {value: this.cornerRadius},
					uAlpha: {value: 0.3}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false,
				cullFace: null
			}),
			live: new Program(this.gl, {
				vertex: borderVertexShader,
				fragment: borderFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.liveBorderColor)},
					uShape: {value: 1},
					uThickness: {value: 0.042},
					uCornerRadius: {value: this.cornerRadius},
					uAlpha: {value: 0.38}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false,
				cullFace: null
			}),
			selected: new Program(this.gl, {
				vertex: borderVertexShader,
				fragment: borderFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.selectedBorderColor)},
					uShape: {value: 1},
					uThickness: {value: 0.036},
					uCornerRadius: {value: this.cornerRadius},
					uAlpha: {value: 0.36}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false,
				cullFace: null
			}),
			hover: new Program(this.gl, {
				vertex: borderVertexShader,
				fragment: borderFragmentShader,
				uniforms: {
					uColor: {value: this.parseColor(this.hoverBorderColor)},
					uShape: {value: 1},
					uThickness: {value: 0.028},
					uCornerRadius: {value: this.cornerRadius},
					uAlpha: {value: 0.28}
				},
				transparent: true,
				depthTest: true,
				depthWrite: false,
				cullFace: null
			})
		}

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

	getCardVisual(styleKey) {
		if (styleKey === 'favorite') return {color: this.favoriteCardColor, alpha: 0.96}
		if (styleKey === 'active') return {color: this.activeCardColor, alpha: 0.98}
		if (styleKey === 'hover') return {color: this.selectedCardColor, alpha: 0.98}
		if (styleKey === 'playing') return {color: this.playingCardColor, alpha: 0.99}
		if (styleKey === 'live') return {color: this.liveCardColor, alpha: 0.99}
		if (styleKey === 'selected') return {color: this.selectedCardColor, alpha: 0.98}
		return {color: this.defaultCardColor, alpha: 0.95}
	}

	getBorderVisual(styleKey) {
		if (styleKey === 'active') return {color: this.activeBorderColor, thickness: 0.016, alpha: 1}
		if (styleKey === 'favorite') return {color: this.favoriteBorderColor, thickness: 0.015, alpha: 1}
		if (styleKey === 'live') return {color: this.liveBorderColor, thickness: 0.019, alpha: 1}
		if (styleKey === 'selected') return {color: this.selectedBorderColor, thickness: 0.017, alpha: 1}
		if (styleKey === 'hover') return {color: this.hoverBorderColor, thickness: 0.014, alpha: 1}
		return {color: this.activeBorderColor, thickness: 0.0, alpha: 0.0}
	}

	getBackgroundProgram(cardStyle = 'default', borderStyle = 'default') {
		const key = `${cardStyle}:${borderStyle}`
		const existing = this.backgroundProgramCache.get(key)
		if (existing) return existing
		if (!this.gl) return this.colorPrograms?.default
		const card = this.getCardVisual(cardStyle)
		const border = this.getBorderVisual(borderStyle)
		const program = new Program(this.gl, {
			vertex: colorVertexShader,
			fragment: colorFragmentShader,
			uniforms: {
				uColor: {value: this.parseColor(card.color)},
				uAlpha: {value: card.alpha},
				uCornerRadius: {value: this.cornerRadius},
				uStrokeColor: {value: this.parseColor(border.color)},
				uStrokeThickness: {value: border.thickness},
				uStrokeAlpha: {value: border.alpha}
			},
			transparent: true,
			depthTest: true,
			depthWrite: false,
			cullFace: null
		})
		this.backgroundProgramCache.set(key, program)
		return program
	}

	getImageZOffset() {
		return IMAGE_Z_OFFSET * this.cardDepthScale
	}

	getInfoZOffset() {
		return INFO_Z_OFFSET * this.cardDepthScale
	}

	getBezelBackZOffset() {
		return BEZEL_BACK_Z_OFFSET * this.cardDepthScale
	}

	getBezelBackScale() {
		return 1 + (BEZEL_BACK_SCALE - 1) * this.cardDepthScale
	}

	getBezelBackProgram(cardStyle = 'default') {
		const key = `bezel:${cardStyle}`
		const existing = this.backgroundProgramCache.get(key)
		if (existing) return existing
		if (!this.gl) return this.colorPrograms?.default
		const card = this.getCardVisual(cardStyle)
		const color = this.parseColor(card.color).map((v) => clamp(v * 0.72, 0, 1))
		const program = new Program(this.gl, {
			vertex: colorVertexShader,
			fragment: colorFragmentShader,
			uniforms: {
				uColor: {value: color},
				uAlpha: {value: 0.98},
				uCornerRadius: {value: this.cornerRadius},
				uStrokeColor: {value: this.parseColor(this.activeBorderColor)},
				uStrokeThickness: {value: 0.0},
				uStrokeAlpha: {value: 0.0}
			},
			transparent: true,
			depthTest: true,
			depthWrite: false,
			cullFace: null
		})
		this.backgroundProgramCache.set(key, program)
		return program
	}

	clearLegacyBorderMeshes(mesh) {
		const layers = mesh?.userData?.borderLayers
		if (layers?.size) for (const [, layer] of layers) layer.setParent(null)
		delete mesh.userData.borderLayers

		const backLayers = mesh?.userData?.borderBackLayers
		if (backLayers?.size) for (const [, layer] of backLayers) layer.setParent(null)
		delete mesh.userData.borderBackLayers

		if (mesh?.userData?.border) {
			mesh.userData.border.setParent(null)
			delete mesh.userData.border
		}
		if (mesh?.userData?.borderBack) {
			mesh.userData.borderBack.setParent(null)
			delete mesh.userData.borderBack
		}
	}

	getTagBadgeTexture() {
		if (!this.gl) return null
		if (this.tagBadgeTexture) return this.tagBadgeTexture
		const canvas = document.createElement('canvas')
		canvas.width = 96
		canvas.height = 96
		const ctx = /** @type {CanvasRenderingContext2D | null} */ (canvas.getContext('2d'))
		if (!ctx) return null
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		ctx.fillStyle = this.tagBadgeColor
		ctx.font = '700 86px sans-serif'
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'
		ctx.fillText('#', canvas.width * 0.5, canvas.height * 0.55)
		this.tagBadgeTexture = new Texture(this.gl, {
			image: canvas,
			generateMipmaps: false,
			minFilter: this.gl.LINEAR,
			magFilter: this.gl.LINEAR
		})
		return this.tagBadgeTexture
	}

	getLiveBadgeTexture() {
		if (!this.gl) return null
		if (this.liveBadgeTexture) return this.liveBadgeTexture
		const canvas = document.createElement('canvas')
		canvas.width = 96
		canvas.height = 96
		const ctx = /** @type {CanvasRenderingContext2D | null} */ (canvas.getContext('2d'))
		if (!ctx) return null
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		const cx = canvas.width * 0.5
		const cy = canvas.height * 0.5
		const r = canvas.width * 0.26
		ctx.fillStyle = this.liveBadgeBgColor
		ctx.beginPath()
		ctx.arc(cx, cy, r, 0, Math.PI * 2)
		ctx.fill()
		ctx.fillStyle = 'rgba(255,255,255,0.9)'
		ctx.beginPath()
		ctx.arc(cx - r * 0.22, cy - r * 0.22, r * 0.36, 0, Math.PI * 2)
		ctx.fill()
		this.liveBadgeTexture = new Texture(this.gl, {
			image: canvas,
			generateMipmaps: false,
			minFilter: this.gl.LINEAR,
			magFilter: this.gl.LINEAR
		})
		return this.liveBadgeTexture
	}

	bindEvents() {
		if (!this.gl?.canvas) return
		const canvas = this.gl.canvas
		canvas.style.cursor = 'default'
		const listen = (target, event, handler, options) => {
			target.addEventListener(event, handler, options)
			this.cleanupFns.push(() => target.removeEventListener(event, handler, options))
		}
		const isCtrlPan = (e) => !!(this.ctrlPanPressed || e?.ctrlKey)

		const onMouseDown = (e) => {
			if (isCtrlPan(e)) {
				this.isDragging = true
				this.forcePanMode = true
				this.skipClickOnce = true
				this.dragDistance = 0
				this.lastMouse = {x: e.clientX, y: e.clientY}
				this.mouseDownPos = {x: e.clientX, y: e.clientY}
				canvas.style.cursor = 'grabbing'
				return
			}
			let startedSingleRotate = false
			if (this.sceneMode === 'single' && this.singleSceneCardDragRotate) {
				const hit = this.raycast(e)
				let mediaItem = hit?.mesh?.userData?.mediaItem
				if (!mediaItem && hit?.mesh?.userData?.isInfo) {
					mediaItem = hit.mesh.userData?.mainMesh?.userData?.mediaItem
				}
				if (mediaItem) {
					startedSingleRotate = true
					this.isSingleCardRotating = true
					this.singleCardRotateDistance = 0
					this.lastMouse = {x: e.clientX, y: e.clientY}
					canvas.style.cursor = 'grabbing'
				}
			}
			if (this.disableNavigation) return
			if (startedSingleRotate) return
			this.isDragging = true
			this.dragDistance = 0
			this.lastMouse = {x: e.clientX, y: e.clientY}
			this.mouseDownPos = {x: e.clientX, y: e.clientY}
			canvas.style.cursor = 'default'
		}
		listen(canvas, 'mousedown', onMouseDown)

		const onMouseUp = (e) => {
			if (this.forcePanMode) {
				this.forcePanMode = false
				this.isDragging = false
				this.dragDistance = 0
				canvas.style.cursor = this.ctrlPanPressed ? 'grab' : 'default'
				return
			}
			if (this.isSingleCardRotating) {
				if (this.singleCardRotateDistance < 5 && this.onClick) this.handleClick(e)
				this.isSingleCardRotating = false
				this.singleCardRotateDistance = 0
				canvas.style.cursor = 'default'
				return
			}
			if (!this.disableNavigation && this.isDragging && this.dragDistance < 5 && this.onClick) {
				this.handleClick(e)
			}
			this.isDragging = false
			canvas.style.cursor = 'default'
		}
		listen(window, 'mouseup', onMouseUp)
		const onCanvasClick = (e) => {
			if (!this.disableNavigation) return
			if (this.skipClickOnce || this.ctrlPanPressed) {
				this.skipClickOnce = false
				return
			}
			this.handleClick(e)
		}
		listen(canvas, 'click', onCanvasClick)

		const onMouseMove = (e) => {
			this.mouse = {
				x: (e.clientX / window.innerWidth) * 2 - 1,
				y: -(e.clientY / window.innerHeight) * 2 + 1
			}
			if (this.enableCardTilt) {
				const rect = canvas.getBoundingClientRect()
				this.singlePointer.x = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1
				this.singlePointer.y = -(((e.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1)
			}
			if (this.ctrlPanPressed && !this.isDragging) {
				if (this.tooltip) this.tooltip.style.opacity = '0'
				canvas.style.cursor = 'grab'
				return
			}
			if (this.isSingleCardRotating) {
				const dx = e.clientX - this.lastMouse.x
				const dy = e.clientY - this.lastMouse.y
				this.singleCardRotateDistance += Math.abs(dx) + Math.abs(dy)
				const s = this.singleSceneCardRotateSensitivity
				this.singleCardRotationTarget.y += dx * s
				this.singleCardRotationTarget.x = clamp(this.singleCardRotationTarget.x + dy * s, -1.2, 1.2)
				this.lastMouse = {x: e.clientX, y: e.clientY}
				if (this.tooltip) this.tooltip.style.opacity = '0'
				return
			}
			if (this.isDragging && (this.forcePanMode || !this.disableNavigation)) {
				const dx = e.clientX - this.lastMouse.x
				const dy = e.clientY - this.lastMouse.y
				this.dragDistance += Math.abs(dx) + Math.abs(dy)
				if (this.forcePanMode || (this.sceneMode === 'single' && this.singleSceneConstrainMovement)) {
					this.basePos.x -= dx * 0.07
					this.basePos.y += dy * 0.07
					this.targetVel.x = 0
					this.targetVel.y = 0
					this.velocity.x = 0
					this.velocity.y = 0
				} else {
					this.targetVel.x -= dx * 0.025
					this.targetVel.y += dy * 0.025
				}
				this.lastMouse = {x: e.clientX, y: e.clientY}
			}
			this.updateTooltip(e)
		}
		listen(window, 'mousemove', onMouseMove)

		const onMouseLeave = () => {
			this.mouse = {x: 0, y: 0}
			this.singlePointer.x = 0
			this.singlePointer.y = 0
			this.isDragging = false
			this.forcePanMode = false
			this.isSingleCardRotating = false
			canvas.style.cursor = 'default'
		}
		listen(canvas, 'mouseleave', onMouseLeave)

		const onWheel = (e) => {
			if (this.disableNavigation) return
			e.preventDefault()
			this.scrollAccum += e.deltaY * 0.006
		}
		listen(canvas, 'wheel', onWheel, {passive: false})

		const onCtrlDown = (e) => {
			if (e.key !== 'Control') return
			this.ctrlPanPressed = true
			if (!this.isDragging) canvas.style.cursor = 'grab'
		}
		const onCtrlUp = (e) => {
			if (e.key !== 'Control') return
			this.ctrlPanPressed = false
			if (!this.isDragging) canvas.style.cursor = 'default'
		}
		listen(window, 'keydown', onCtrlDown)
		listen(window, 'keyup', onCtrlUp)

		if (!this.disableNavigation) {
			const onKeyDown = (e) => this.handleKey(e.key, true)
			const onKeyUp = (e) => this.handleKey(e.key, false)
			listen(window, 'keydown', onKeyDown)
			listen(window, 'keyup', onKeyUp)
		}

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

		const onTouchStart = (e) => {
			if (this.disableNavigation) return
			e.preventDefault()
			lastTouches = [...e.touches]
			lastTouchDist = getTouchDistance(lastTouches)
			if (e.touches.length === 1) {
				touchStartPos = {x: e.touches[0].clientX, y: e.touches[0].clientY}
				touchDragDistance = 0
			}
		}
		const onTouchMove = (e) => {
			if (this.disableNavigation) return
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
		}
		const onTouchEnd = (e) => {
			if (this.disableNavigation) return
			if (touchStartPos && touchDragDistance < 10 && this.onClick) {
				this.handleClick({clientX: touchStartPos.x, clientY: touchStartPos.y})
			}
			touchStartPos = null
			lastTouches = [...e.touches]
			lastTouchDist = getTouchDistance(lastTouches)
		}
		listen(canvas, 'touchstart', onTouchStart, {passive: false})
		listen(canvas, 'touchmove', onTouchMove, {passive: false})
		listen(canvas, 'touchend', onTouchEnd, {passive: false})
	}

	createTooltip() {
		this.tooltip = document.createElement('div')
		Object.assign(this.tooltip.style, {
			position: 'absolute',
			padding: '6px 10px',
			background: 'var(--gray-1)',
			color: 'var(--gray-12)',
			border: '1px solid var(--gray-5)',
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

	/**
	 * @param {any} mediaItem
	 * @param {{href?: string, type: 'channel'|'tag'|'mention'|'tracks', token?: string | null} | null} [target]
	 */
	formatHoverLabel(mediaItem, target = null) {
		const base = mediaItem?.slug ? `@${mediaItem.slug}` : ''
		if (!target) return base
		if (target.type === 'channel') return base
		if (target.type === 'tracks') return `${base}/tracks`
		if (target.type === 'tag' && target.token) return `${base} ${target.token}`
		if (target.type === 'mention' && target.token) return target.token
		return base
	}

	updateTooltip(e) {
		if (!this.tooltip || !this.gl?.canvas) return
		if (this.isDragging) {
			this.tooltip.style.opacity = '0'
			return
		}

		const hit = this.raycast(e)
		if (hit) {
			const intersected = hit.mesh
			let mediaItem = intersected.userData.mediaItem
			if (!mediaItem && intersected.userData?.isInfo) {
				mediaItem = intersected.userData?.mainMesh?.userData?.mediaItem
			}
			/** @type {{href?: string, type: 'channel'|'tag'|'mention'|'tracks', token?: string | null} | null} */
			let linkTarget = null
			if (mediaItem && mediaItem !== this.hoveredItem) {
				this.hoveredItem = mediaItem
				this.setHoveredId(mediaItem.id ?? null)
			}
			const rect = this.gl.canvas.getBoundingClientRect()
			this.tooltip.style.opacity = '1'
			this.tooltip.style.left = `${e.clientX - rect.left + 12}px`
			this.tooltip.style.top = `${e.clientY - rect.top + 12}px`
			if (intersected.userData?.isInfo && mediaItem) {
				const halfW = intersected.scale.x * 0.5
				const halfH = intersected.scale.y * 0.5
				const px = ((hit.localX + halfW) / (halfW * 2)) * CHANNEL_INFO_CANVAS.width
				const py = ((halfH - hit.localY) / (halfH * 2)) * CHANNEL_INFO_CANVAS.height
				const target = resolveChannelInfoClickTarget({mediaItem, x: px, y: py})
				linkTarget = target
				this.setInfoHoverTarget(target ? {id: mediaItem.id, type: target.type, token: target.token ?? null} : null)
				this.gl.canvas.style.cursor = target ? 'pointer' : 'default'
			} else {
				this.setInfoHoverTarget(null)
				this.gl.canvas.style.cursor = 'default'
			}
			if (mediaItem) {
				const isOpen = !!this.getInfoStyle(mediaItem)
				if (isOpen && !linkTarget) {
					this.tooltip.style.opacity = '0'
				} else {
					this.tooltip.style.opacity = '1'
					this.tooltip.textContent = this.formatHoverLabel(mediaItem, linkTarget)
				}
			}
		} else {
			this.tooltip.style.opacity = '0'
			this.hoveredItem = null
			this.setHoveredId(null)
			this.setInfoHoverTarget(null)
			this.gl.canvas.style.cursor = 'default'
		}
	}

	handleClick(e) {
		const hit = this.raycast(e)
		if (hit) {
			const intersected = hit.mesh
			let mediaItem = intersected.userData.mediaItem
			if (!mediaItem && intersected.userData?.isInfo) {
				mediaItem = intersected.userData?.mainMesh?.userData?.mediaItem
			}
			if (intersected.userData?.isInfo && mediaItem) {
				const halfW = intersected.scale.x * 0.5
				const halfH = intersected.scale.y * 0.5
				const px = ((hit.localX + halfW) / (halfW * 2)) * CHANNEL_INFO_CANVAS.width
				const py = ((halfH - hit.localY) / (halfH * 2)) * CHANNEL_INFO_CANVAS.height
				const target = resolveChannelInfoClickTarget({mediaItem, x: px, y: py})
				if (target) {
					if (this.onNavigate) {
						this.onNavigate(target.href ?? '', mediaItem, target.type, target.token ?? null)
						return
					}
				}
			}
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
					if (
						!mesh.visible ||
						mesh.userData.isBorder ||
						mesh.userData.isTagBadge ||
						mesh.userData.isLiveBadge ||
						mesh.userData.isBezelBack
					)
						continue

				const intersection = this.rayPlaneIntersection(ray, mesh)
				if (intersection && intersection.distance < closestDist) {
					closestDist = intersection.distance
					closest = {mesh, ...intersection}
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
			return {distance: t, localX: lp.x, localY: lp.y}
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

	getInfoTexture(mediaItem, style = 'selected') {
		if (!this.gl || !mediaItem?.id) return null
		const hover =
			this.infoHoverTarget?.id === mediaItem.id
				? `${this.infoHoverTarget.type}:${this.infoHoverTarget.token ?? ''}`
				: ''
		const key = `info:${mediaItem.id}:${style}:${mediaItem.isLive ? 1 : 0}:${mediaItem.isFavorite ? 1 : 0}:${mediaItem.isPlaying ? 1 : 0}:${this.activeIds.has(mediaItem.id) ? 1 : 0}:${(mediaItem.activeTags || []).join(',')}:${(mediaItem.activeMentions || []).join(',')}:${hover}`
		if (this.infoTextureCache.has(key)) return this.infoTextureCache.get(key)
		const canvas = buildChannelInfoCanvas({
			mediaItem,
			style: /** @type {'active' | 'selected'} */ (style),
			activeId: this.activeId,
			hoverTarget: this.infoHoverTarget?.id === mediaItem.id ? this.infoHoverTarget : null,
			colors: {
				infoBgColor: this.infoBgColor,
				infoTextColor: this.infoTextColor,
				infoMutedColor: this.infoMutedColor,
				tagBgColor: this.tagBgColor,
				tagTextColor: this.tagTextColor,
				tagHoverBgColor: this.tagHoverBgColor,
				tagHoverBorderColor: this.tagHoverBorderColor,
				tagActiveBgColor: this.tagActiveBgColor,
				tagActiveTextColor: this.tagActiveTextColor,
				tagActiveBorderColor: this.tagActiveBorderColor,
				selectedBorderColor: this.selectedBorderColor,
				hoverBorderColor: this.hoverBorderColor,
				selectedCardColor: this.selectedCardColor,
				playingCardColor: this.playingCardColor,
				activeBorderColor: this.activeBorderColor,
				activeCardColor: this.activeCardColor,
				activeInfoTextColor: this.activeInfoTextColor,
				activeInfoMutedColor: this.activeInfoMutedColor,
				liveBadgeBgColor: this.liveBadgeBgColor,
				liveBadgeTextColor: this.liveBadgeTextColor,
				favoriteBorderColor: this.favoriteBorderColor
			}
		})

		const texture = new Texture(this.gl, {
			image: canvas,
			generateMipmaps: false,
			minFilter: this.gl.LINEAR,
			magFilter: this.gl.LINEAR
		})
		this.infoTextureCache.set(key, texture)
		return texture
	}

	setActiveId(id) {
		if (this.activeId === id) return
		this.activeId = id
		this.activeIds = new Set(id ? [id] : [])
		this.refreshAllBorders()
	}

	setActiveIds(ids) {
		const next = new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])
		const same = next.size === this.activeIds.size && [...next].every((id) => this.activeIds.has(id))
		if (same) return
		this.activeIds = next
		this.activeId = next.values().next().value ?? null
		this.refreshAllBorders()
	}

	setHoveredId(id) {
		if (this.hoveredId === id) return
		this.hoveredId = id
		this.refreshAllBorders()
	}

	getMeshBorderStyles(mediaItem) {
		return resolveChannelCardStates(mediaItem, {
			activeId: this.activeId,
			activeIds: [...this.activeIds],
			selectedId: this.selectedId,
			hoveredId: this.hoveredId
		}).borderStyles
	}

	getCardStyle(mediaItem) {
		return resolveChannelCardStates(mediaItem, {
			activeId: this.activeId,
			activeIds: [...this.activeIds],
			selectedId: this.selectedId,
			hoveredId: this.hoveredId
		}).cardStyle
	}

	getInfoStyle(mediaItem) {
		return resolveChannelCardStates(mediaItem, {
			activeId: this.activeId,
			activeIds: [...this.activeIds],
			selectedId: this.selectedId,
			hoveredId: this.hoveredId
		}).infoStyle
	}

	setSelectedId(id) {
		if (this.selectedId === id) return
		this.selectedId = id
		this.refreshAllBorders()
	}

	setInfoHoverTarget(target) {
		const prev = this.infoHoverTarget
		const same =
			(prev?.id ?? null) === (target?.id ?? null) &&
			(prev?.type ?? null) === (target?.type ?? null) &&
			(prev?.token ?? null) === (target?.token ?? null)
		if (same) return
		this.infoHoverTarget = target
		this.infoTextureCache.clear()
		this.refreshAllBorders()
	}

	refreshAllBorders() {
		for (const group of this.chunks.values()) {
			// Snapshot children to avoid mutation during iteration
			const children = [...group.children]
			for (const mesh of children) {
				const ud = mesh.userData
				if (!ud || ud.isBorder) continue
				if (!ud.mediaItem) continue
				if (ud.isBackground) {
					const styleKey = this.getCardStyle(ud.mediaItem)
					const borderStyle = this.getMeshBorderStyles(ud.mediaItem)?.[0] ?? 'default'
					mesh.program = this.getBackgroundProgram(styleKey, borderStyle)
					ud.bodyStyle = styleKey
					if (ud.bezelBack) {
						ud.bezelBack.program = this.getBezelBackProgram(styleKey)
						if (ud.bezelBack.userData) ud.bezelBack.userData.bodyStyle = styleKey
					}
					this.clearLegacyBorderMeshes(mesh)
					continue
				}
				this.updateMeshTagBadge(mesh, group)
				this.updateMeshLiveBadge(mesh, group)
				const infoStyle = this.getInfoStyle(ud.mediaItem)
				this.updateMeshInfo(mesh, infoStyle, group)
			}
		}
	}

	updateMeshInfo(mesh, style, group) {
		const bg = mesh.userData.backgroundMesh
		if (!bg?.userData) return
		const bgClosedPos = bg.userData.closedPosition
		const bgClosedScale = bg.userData.closedScale
		if (style) {
			const ts = mesh.userData.targetScale
			const infoScaleY = ts.y * 0.5
			const gap = ts.y * 0.01
			const infoY = mesh.position.y - ts.y * 0.5 - infoScaleY * 0.5 - gap
			// Background surface becomes the unified body and expands to include info.
			const bodyWidth = bgClosedScale?.x ?? ts.x
			const totalHeight = (bgClosedScale?.y ?? ts.y) + gap + infoScaleY
			const centerY = (bgClosedPos?.y ?? mesh.position.y) - (gap + infoScaleY) * 0.5
			bg.userData.bodyTarget = {
				x: bgClosedPos?.x ?? mesh.position.x,
				y: centerY,
				sx: bodyWidth,
				sy: totalHeight,
				open: true
			}
			bg.userData.bodyStyle = style === 'active' ? 'active' : 'default'
				if (bg.userData.bezelBack?.userData) {
					const bezelScale = this.getBezelBackScale()
					bg.userData.bezelBack.userData.bodyTarget = {
						x: bgClosedPos?.x ?? mesh.position.x,
						y: centerY,
						sx: bodyWidth * bezelScale,
						sy: totalHeight * bezelScale,
						open: true
					}
					bg.userData.bezelBack.userData.bodyStyle = style === 'active' ? 'active' : 'default'
				}

			if (!mesh.userData.info && this.gl) {
				const infoProgram = this.infoProgram
				if (!infoProgram) return
				const info = new Mesh(this.gl, {
					geometry: this.planeGeometry ?? undefined,
					program: infoProgram
				})
				info.renderOrder = 30
				// Keep text panel attached to artwork and equal width.
				info.position.set(mesh.position.x, infoY, mesh.position.z + this.getInfoZOffset())
				info.scale.set(ts.x, infoScaleY, 1)
				const texture = this.getInfoTexture(mesh.userData.mediaItem, style)
				info.onBeforeRender(() => {
					infoProgram.uniforms.tMap.value = texture
				})
				// @ts-expect-error custom field
				info.userData = {isInfo: true, mainMesh: mesh, style}
				info.setParent(group)
				mesh.userData.info = info
			} else if (mesh.userData.info?.userData?.style !== style) {
				const infoProgram = this.infoProgram
				if (!infoProgram) return
				const texture = this.getInfoTexture(mesh.userData.mediaItem, style)
				mesh.userData.info.onBeforeRender(() => {
					infoProgram.uniforms.tMap.value = texture
				})
				mesh.userData.info.userData.style = style
				mesh.userData.info.position.set(mesh.position.x, infoY, mesh.position.z + this.getInfoZOffset())
				mesh.userData.info.scale.set(ts.x, infoScaleY, 1)
			} else if (mesh.userData.info) {
				mesh.userData.info.position.set(mesh.position.x, infoY, mesh.position.z + this.getInfoZOffset())
				mesh.userData.info.scale.set(ts.x, infoScaleY, 1)
			}
		} else {
			bg.userData.bodyTarget = {
				x: bgClosedPos?.x ?? bg.position.x,
				y: bgClosedPos?.y ?? bg.position.y,
				sx: bgClosedScale?.x ?? bg.scale.x,
				sy: bgClosedScale?.y ?? bg.scale.y,
				open: false
			}
				bg.userData.bodyStyle = this.getCardStyle(bg.userData.mediaItem)
				if (bg.userData.bezelBack?.userData) {
					const bezelScale = this.getBezelBackScale()
					bg.userData.bezelBack.userData.bodyTarget = {
						x: bgClosedPos?.x ?? bg.position.x,
						y: bgClosedPos?.y ?? bg.position.y,
						sx: (bgClosedScale?.x ?? bg.scale.x) * bezelScale,
						sy: (bgClosedScale?.y ?? bg.scale.y) * bezelScale,
						open: false
					}
					bg.userData.bezelBack.userData.bodyStyle = this.getCardStyle(bg.userData.mediaItem)
			}
			if (mesh.userData.info) {
				mesh.userData.info.setParent(null)
				delete mesh.userData.info
			}
		}
	}

	updateMeshTagBadge(mesh, group) {
		if (!mesh?.userData?.mediaItem) return
		const ts = mesh.userData.targetScale
		if (!ts) return
		const show = !!mesh.userData.mediaItem.hasActiveTagMatch
		if (!show) {
			if (mesh.userData.tagBadge) {
				mesh.userData.tagBadge.setParent(null)
				delete mesh.userData.tagBadge
			}
			return
		}
		if (!this.gl || !this.infoProgram) return
		const infoProgram = this.infoProgram
		let badge = mesh.userData.tagBadge
		if (!badge) {
			badge = new Mesh(this.gl, {
				geometry: this.planeGeometry ?? undefined,
				program: infoProgram
			})
			badge.userData = {isTagBadge: true, mainMesh: mesh}
			badge.setParent(group)
			mesh.userData.tagBadge = badge
		}
		badge.renderOrder = 40
		const texture = this.getTagBadgeTexture()
		if (!texture) return
		badge.onBeforeRender(() => {
			infoProgram.uniforms.tMap.value = texture
		})
		const badgeSize = Math.max(ts.x, ts.y) * 0.16
		badge.scale.set(badgeSize, badgeSize, 1)
		badge.position.set(mesh.position.x, mesh.position.y + ts.y * 0.58, mesh.position.z + 0.19)
	}

	updateMeshLiveBadge(mesh, group) {
		if (!mesh?.userData?.mediaItem) return
		const ts = mesh.userData.targetScale
		if (!ts) return
		const show = !!mesh.userData.mediaItem.isLive
		if (!show) {
			if (mesh.userData.liveBadge) {
				mesh.userData.liveBadge.setParent(null)
				delete mesh.userData.liveBadge
			}
			return
		}
		if (!this.gl || !this.infoProgram) return
		const infoProgram = this.infoProgram
		let badge = mesh.userData.liveBadge
		if (!badge) {
			badge = new Mesh(this.gl, {
				geometry: this.planeGeometry ?? undefined,
				program: infoProgram
			})
			badge.userData = {isLiveBadge: true, mainMesh: mesh}
			badge.setParent(group)
			mesh.userData.liveBadge = badge
		}
		badge.renderOrder = 50
		const texture = this.getLiveBadgeTexture()
		if (!texture) return
		badge.onBeforeRender(() => {
			infoProgram.uniforms.tMap.value = texture
		})
		this.layoutLiveBadge(mesh, badge)
	}

	layoutLiveBadge(mesh, badge) {
		const anchor = mesh?.userData?.backgroundMesh || mesh
		if (!anchor?.scale || !anchor?.position) return
		const badgeSize = Math.max(anchor.scale.x, anchor.scale.y) * 0.14
		const inset = badgeSize * 0.18
		badge.scale.set(badgeSize, badgeSize, 1)
		badge.position.set(
			anchor.position.x + anchor.scale.x * 0.5 - inset,
			anchor.position.y + anchor.scale.y * 0.5 - inset,
			mesh.position.z + 0.2
		)
	}

	updateMeshBorder(mesh, styleKeys, group) {
		this.clearLegacyBorderMeshes(mesh)
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

	createCardMeshes(group, plane, mediaItem, birthTime) {
		if (!this.gl) return
		const sizeScale = this.cardSizeScale
		const scaledW = plane.scale.x * sizeScale
		const scaledH = plane.scale.y * sizeScale
		const cardStyle = this.getCardStyle(mediaItem)
		const mesh = new Mesh(this.gl, {
			geometry: this.planeGeometry ?? undefined,
			program: this.getBackgroundProgram(cardStyle, this.getMeshBorderStyles(mediaItem)?.[0] ?? 'default')
		})
		mesh.renderOrder = 10
		mesh.position.set(plane.position.x, plane.position.y, plane.position.z)
		mesh.scale.set(0.01, 0.01, 0.01)
		// @ts-expect-error - adding custom property
		mesh.userData = {
			isBorder: false,
			isBackground: true,
			mediaItem,
			cardStyle,
			birthTime,
			targetScale: {x: scaledW, y: scaledH, z: plane.scale.z},
			closedPosition: {x: plane.position.x, y: plane.position.y, z: plane.position.z},
			closedScale: {x: scaledW, y: scaledH, z: plane.scale.z},
			bodyTarget: {x: plane.position.x, y: plane.position.y, sx: scaledW, sy: scaledH, open: false},
			bodyStyle: cardStyle
		}
		mesh.setParent(group)
		if (this.useRoundedBezel) {
			const bezelScale = this.getBezelBackScale()
			const back = new Mesh(this.gl, {
				geometry: this.planeGeometry ?? undefined,
				program: this.getBezelBackProgram(cardStyle)
			})
			back.renderOrder = 5
			back.position.set(plane.position.x, plane.position.y, plane.position.z + this.getBezelBackZOffset())
			back.scale.set(0.01, 0.01, 0.01)
			// @ts-expect-error custom field
			back.userData = {
				isBezelBack: true,
				mainMesh: mesh,
				mediaItem,
				cardStyle,
				birthTime,
				targetScale: {x: scaledW * bezelScale, y: scaledH * bezelScale, z: plane.scale.z},
				closedPosition: {x: plane.position.x, y: plane.position.y, z: plane.position.z + this.getBezelBackZOffset()},
				closedScale: {
					x: scaledW * bezelScale,
					y: scaledH * bezelScale,
					z: plane.scale.z
				},
				bodyTarget: {
					x: plane.position.x,
					y: plane.position.y,
					sx: scaledW * bezelScale,
					sy: scaledH * bezelScale,
					open: false
				},
				bodyStyle: cardStyle
			}
			back.setParent(group)
			// @ts-expect-error custom field
			mesh.userData.bezelBack = back
		}

		if (!mediaItem?.url) return
		const texture = this.getTexture(mediaItem.url)
		const sharedProgram = /** @type {Program} */ (this.texturedProgram)
		const imgMesh = new Mesh(this.gl, {geometry: this.planeGeometry ?? undefined, program: sharedProgram})
		imgMesh.renderOrder = 20
		imgMesh.position.set(plane.position.x, plane.position.y, plane.position.z + this.getImageZOffset())
		imgMesh.scale.set(0.01, 0.01, 0.01)
		imgMesh.onBeforeRender(() => {
			sharedProgram.uniforms.tMap.value = texture
		})
		// @ts-expect-error - adding custom property
		imgMesh.userData = {
			isBorder: false,
			mediaItem,
			birthTime,
			texture,
			targetScale: {x: plane.scale.x * IMAGE_INSET, y: plane.scale.y * IMAGE_INSET, z: 1},
			backgroundMesh: mesh
		}
		imgMesh.setParent(group)
		this.clearLegacyBorderMeshes(mesh)
		this.updateMeshTagBadge(imgMesh, group)
		this.updateMeshLiveBadge(imgMesh, group)
		const infoStyle = this.getInfoStyle(mediaItem)
		this.updateMeshInfo(imgMesh, infoStyle, group)
	}

	createSingleScene() {
		if (this.chunks.has(SINGLE_SCENE_KEY) || !this.gl || !this.scene) return
		const group = new Transform()
		// @ts-expect-error - adding custom property
		group.userData = {single: true}
		group.rotation.set(this.singleCardRotation.x, this.singleCardRotation.y, 0)
		group.setParent(this.scene)
		const mediaItem = this.media.length > 0 ? this.media[0] : null
		const plane = {
			position: {x: 0, y: 0, z: 0},
			scale: {x: this.singleCardSize, y: this.singleCardSize, z: 1}
		}
		this.createCardMeshes(group, plane, mediaItem, performance.now())
		this.chunks.set(SINGLE_SCENE_KEY, group)
		this.animatingChunks.add(SINGLE_SCENE_KEY)
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
			this.createCardMeshes(group, plane, mediaItem, birthTime)
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
		if (this.sceneMode === 'single') {
			if (!this.chunks.has(SINGLE_SCENE_KEY) || force) {
				if (this.chunks.has(SINGLE_SCENE_KEY)) this.removeChunk(SINGLE_SCENE_KEY)
				this.createSingleScene()
			}
			this.chunkQueue = []
			return
		}

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

		if (!this.disableNavigation) {
			if (this.keys.forward) this.targetVel.z -= KEYBOARD_SPEED
			if (this.keys.backward) this.targetVel.z += KEYBOARD_SPEED
			if (this.keys.left) this.targetVel.x -= KEYBOARD_SPEED
			if (this.keys.right) this.targetVel.x += KEYBOARD_SPEED
			if (this.keys.down) this.targetVel.y -= KEYBOARD_SPEED
			if (this.keys.up) this.targetVel.y += KEYBOARD_SPEED

			const isZooming = Math.abs(this.velocity.z) > 0.05
			const driftAmount = 8.0 * clamp(this.basePos.z / 50, 0.3, 2.0)
			const driftLerp = isZooming ? 0.2 : 0.12
			if (!this.isDragging && (this.sceneMode !== 'single' || this.singleSceneMouseDrift)) {
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
			if (this.minCameraZ != null || this.maxCameraZ != null) {
				const minZ = this.minCameraZ ?? -Infinity
				const maxZ = this.maxCameraZ ?? Infinity
				this.basePos.z = clamp(this.basePos.z, minZ, maxZ)
			}
			if (this.sceneMode === 'single' && this.singleSceneMaxXY != null) {
				this.basePos.x = clamp(this.basePos.x, -this.singleSceneMaxXY, this.singleSceneMaxXY)
				this.basePos.y = clamp(this.basePos.y, -this.singleSceneMaxXY, this.singleSceneMaxXY)
			}
			if (this.sceneMode === 'single' && this.singleSceneConstrainMovement) {
				const maxXY = Math.max(this.singleCardSize * this.cardSizeScale * 0.85, 10)
				this.basePos.x = clamp(this.basePos.x, -maxXY, maxXY)
				this.basePos.y = clamp(this.basePos.y, -maxXY, maxXY)
				this.drift.x = clamp(this.drift.x, -maxXY * 0.8, maxXY * 0.8)
				this.drift.y = clamp(this.drift.y, -maxXY * 0.8, maxXY * 0.8)
				if (Math.abs(this.basePos.x) >= maxXY) {
					this.velocity.x = 0
					this.targetVel.x = 0
				}
				if (Math.abs(this.basePos.y) >= maxXY) {
					this.velocity.y = 0
					this.targetVel.y = 0
				}
			}
			if ((this.minCameraZ != null && this.basePos.z <= this.minCameraZ) || (this.maxCameraZ != null && this.basePos.z >= this.maxCameraZ)) {
				this.velocity.z = 0
				this.targetVel.z = 0
				this.scrollAccum = 0
			}
			this.camera.position.set(this.basePos.x + this.drift.x, this.basePos.y + this.drift.y, this.basePos.z)
			if (this.sceneMode === 'single' && this.singleSceneConstrainMovement && typeof this.camera.lookAt === 'function')
				this.camera.lookAt([0, 0, 0])
		} else {
			const tiltX = this.enableCardTilt ? this.singlePointer.x * this.tiltAmount : 0
			const tiltY = this.enableCardTilt ? this.singlePointer.y * this.tiltAmount : 0
			this.camera.position.x = lerp(this.camera.position.x, tiltX, 0.08)
			this.camera.position.y = lerp(this.camera.position.y, tiltY, 0.08)
			const targetZ =
				this.minCameraZ != null || this.maxCameraZ != null
					? clamp(INITIAL_CAMERA_Z, this.minCameraZ ?? -Infinity, this.maxCameraZ ?? Infinity)
					: INITIAL_CAMERA_Z
			this.camera.position.z = lerp(this.camera.position.z, targetZ, 0.08)
			if (typeof this.camera.lookAt === 'function') this.camera.lookAt([0, 0, 0])
			this.basePos.x = this.camera.position.x
			this.basePos.y = this.camera.position.y
			this.basePos.z = this.camera.position.z
		}

		// Update depth fade uniform for shaders
		const camZ = this.basePos.z
		if (this.texturedProgram) this.texturedProgram.uniforms.uCameraZ.value = camZ
		if (this.infoProgram) this.infoProgram.uniforms.uCameraZ.value = camZ

		if (this.sceneMode === 'single') {
			this.singleCardRotation.x = lerp(this.singleCardRotation.x, this.singleCardRotationTarget.x, 0.15)
			this.singleCardRotation.y = lerp(this.singleCardRotation.y, this.singleCardRotationTarget.y, 0.15)
			const singleGroup = this.chunks.get(SINGLE_SCENE_KEY)
			if (singleGroup) singleGroup.rotation.set(this.singleCardRotation.x, this.singleCardRotation.y, 0)
		}

		this.updateChunks()
		this.processChunkQueue()
		this.animateEntrance()
		this.animateExits()
		this.updateVisibility()
		this.rotateBorders()
		this.animateCardBodies()
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
				if (ud.isInfo) {
					if (ud.mainMesh) mesh.visible = ud.mainMesh.visible
					continue
				}
				if (ud.isTagBadge) {
					if (ud.mainMesh) mesh.visible = ud.mainMesh.visible
					continue
				}
				if (ud.isLiveBadge) {
					if (ud.mainMesh) mesh.visible = ud.mainMesh.visible
					continue
				}
				if (ud.isBezelBack) {
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
		// Border is drawn as stroke on background shader.
	}

	animateCardBodies() {
		const t = 0.18
		for (const group of this.chunks.values()) {
			for (const mesh of group.children) {
				const ud = mesh.userData
				if (ud?.liveBadge) this.layoutLiveBadge(mesh, ud.liveBadge)
				if (ud?.isBezelBack && ud.bodyTarget) {
					const target = ud.bodyTarget
					const styleKey = ud.bodyStyle || 'default'
					mesh.program = this.getBezelBackProgram(styleKey)
					mesh.position.x = lerp(mesh.position.x, target.x, t)
					mesh.position.y = lerp(mesh.position.y, target.y, t)
					mesh.scale.x = lerp(mesh.scale.x, target.sx, t)
					mesh.scale.y = lerp(mesh.scale.y, target.sy, t)
					continue
				}
				if (!ud?.isBackground || !ud.bodyTarget) continue
				const target = ud.bodyTarget
				const styleKey = ud.bodyStyle || 'default'
				const borderStyle = this.getMeshBorderStyles(ud.mediaItem)?.[0] ?? 'default'
				mesh.program = this.getBackgroundProgram(styleKey, borderStyle)
				mesh.position.x = lerp(mesh.position.x, target.x, t)
				mesh.position.y = lerp(mesh.position.y, target.y, t)
				mesh.scale.x = lerp(mesh.scale.x, target.sx, t)
				mesh.scale.y = lerp(mesh.scale.y, target.sy, t)
			}
		}
	}

	setMedia(media) {
		const next = media || []
		const sameOrder =
			this.media.length === next.length &&
			this.media.every((item, index) => item?.id && next[index]?.id && item.id === next[index].id)

		this.media = next
		if (sameOrder) {
			// Fast path: update media metadata in-place without rebuilding chunks.
			const byId = new Map(this.media.map((item) => [item.id, item]))
			for (const group of this.chunks.values()) {
				for (const mesh of group.children) {
					const ud = mesh.userData
					if (!ud?.mediaItem?.id) continue
					const replacement = byId.get(ud.mediaItem.id)
					if (replacement) ud.mediaItem = replacement
				}
			}
			this.infoTextureCache.clear()
			this.refreshAllBorders()
			return
		}

		for (const key of this.chunks.keys()) this.removeChunk(key)
		for (const [, group] of this.exitingChunks) {
			group.setParent(null)
		}
		this.exitingChunks.clear()
		this.infoTextureCache.clear()
		this.updateChunks(true)
	}

	dispose() {
		this.disposed = true
		if (this.animationId) cancelAnimationFrame(this.animationId)
		this.resizeObserver?.disconnect()
		for (const fn of this.cleanupFns) fn()
		this.cleanupFns = []

		for (const key of this.chunks.keys()) this.removeChunk(key)
		for (const [, group] of this.exitingChunks) {
			group.setParent(null)
		}
		this.exitingChunks.clear()
		for (const texture of this.textureCache.values()) {
			if (texture.texture && this.gl) this.gl.deleteTexture(texture.texture)
		}
		this.textureCache.clear()
		for (const texture of this.infoTextureCache.values()) {
			if (texture.texture && this.gl) this.gl.deleteTexture(texture.texture)
		}
		this.infoTextureCache.clear()
		if (this.tagBadgeTexture?.texture && this.gl) this.gl.deleteTexture(this.tagBadgeTexture.texture)
		this.tagBadgeTexture = null
		if (this.liveBadgeTexture?.texture && this.gl) this.gl.deleteTexture(this.liveBadgeTexture.texture)
		this.liveBadgeTexture = null
		this.backgroundProgramCache.clear()
		this.texturedProgram = null
		this.infoProgram = null
		this.colorPrograms = null
		this.borderPrograms = null
		this.borderBackPrograms = null
		this.planeCache.clear()
		this.planeGeometry = null
		this.borderGeometry = null
		if (this.gl) this.container.removeChild(this.gl.canvas)
		this.tooltip?.remove()
	}
}
