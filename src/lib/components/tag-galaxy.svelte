<script lang="ts">
	import {onMount, untrack} from 'svelte'
	import {SvelteSet, SvelteMap} from 'svelte/reactivity'
	import {Renderer, Camera, Transform, Geometry, Program, Mesh, Vec3, Mat4} from 'ogl'
	import type {OGLRenderingContext} from 'ogl'
	import gsap from 'gsap'
	import {forceSimulation, forceManyBody, forceLink, forceCenter} from 'd3-force-3d'
	import type {TagGraphNode, TagGraphEdge} from '$lib/utils'

	interface Props {
		nodes: TagGraphNode[]
		edges: TagGraphEdge[]
		searchQuery?: string
		onNodeClick?: (node: TagGraphNode) => void
	}

	let {nodes = [], edges = [], searchQuery = '', onNodeClick}: Props = $props()

	let container: HTMLDivElement
	let glCanvas: HTMLCanvasElement
	let labelCanvas: HTMLCanvasElement

	// Camera orbit state — plain object so GSAP can animate it
	// orbitX = pitch, orbitY = yaw, zoom = camera radius from origin
	// panX/panY = orbit center offset (Ctrl+drag)
	const cam = {orbitX: -0.3, orbitY: 0, zoom: 300, panX: 0, panY: 0}

	// Inertia (applied in render loop when not dragging / not GSAP tweening)
	let velX = 0
	let velY = 0
	const INERTIA = 0.88
	const HALF_PI = Math.PI / 2

	// Hover/select — reactive so uploadNodeColors re-runs
	let hoveredIdx = $state(-1)
	let selectedIdx = $state(-1)
	let connectedSet = new SvelteSet<number>()

	// Simulation output: Float32Array of [x,y,z, x,y,z, …]
	let simPos: Float32Array<ArrayBuffer> = new Float32Array(0) as Float32Array<ArrayBuffer>
	// Maps edge array index → [sourceNodeIdx, targetNodeIdx] for uploadEdgeColors()
	let edgeNodeIndices: Array<[number, number]> = []

	// OGL
	let renderer: InstanceType<typeof Renderer>
	let gl: OGLRenderingContext
	let camera: InstanceType<typeof Camera>
	let scene: InstanceType<typeof Transform>
	let nodeMesh: InstanceType<typeof Mesh> | null = null
	let edgeMesh: InstanceType<typeof Mesh> | null = null
	let ctx2d: CanvasRenderingContext2D | null = null
	const vpMat = new Mat4()
	let rafId: number
	let canvasW = 0
	let canvasH = 0
	let glReady = $state(false)

	// Theme colors — populated from CSS vars in onMount
	// WebGL float[3] node colors
	let clrNode: [number, number, number] = [0.3, 0.55, 0.9]
	let clrHover: [number, number, number] = [1.0, 0.75, 0.2]
	let clrSelected: [number, number, number] = [1.0, 0.75, 0.2]
	let clrConnected: [number, number, number] = [0.4, 0.7, 1.0]
	let clrDimmed: [number, number, number] = [0.12, 0.14, 0.18]
	let clrEdge: [number, number, number] = [0.35, 0.4, 0.5]
	// Canvas 2D label colors — all set from CSS vars in readThemeColors()
	let c2dLabelBg = ''
	let c2dLabelBgMatch = ''
	let c2dLabelBgSelected = ''
	let c2dLabelText = ''
	let c2dLabelTextHover = '' // text on gray pill (hovered)
	let c2dLabelTextSelected = '' // text on accent-9 pill (selected)
	let c2dLabelTextDimmed = ''

	// ---------------------------------------------------------------------------
	// CSS var helpers — same pattern as channel-scene-theme.js
	// ---------------------------------------------------------------------------

	function getCssColor(variable: string): string {
		if (typeof document === 'undefined') return '#888'
		const div = document.createElement('div')
		div.style.color = `var(${variable})`
		div.style.visibility = 'hidden'
		div.style.position = 'absolute'
		document.body.appendChild(div)
		const color = getComputedStyle(div).color
		document.body.removeChild(div)
		return color
	}

	function parseColor(color: string): [number, number, number] {
		if (typeof document === 'undefined') return [0.5, 0.5, 0.5]
		const c = document.createElement('canvas')
		c.width = c.height = 1
		const ctx = c.getContext('2d')!
		ctx.fillStyle = '#000'
		ctx.fillStyle = color
		ctx.fillRect(0, 0, 1, 1)
		const d = ctx.getImageData(0, 0, 1, 1).data
		return [d[0] / 255, d[1] / 255, d[2] / 255]
	}

	function cssRgba(variable: string, alpha: number): string {
		const [r, g, b] = parseColor(getCssColor(variable))
		return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${alpha})`
	}

	function readThemeColors() {
		// Node colors — gray-12 is maximum contrast in any theme (near-black light / near-white dark)
		clrNode = parseColor(getCssColor('--gray-12'))
		clrHover = parseColor(getCssColor('--accent-9'))
		clrSelected = parseColor(getCssColor('--accent-9'))
		clrConnected = parseColor(getCssColor('--accent-8'))
		clrDimmed = parseColor(getCssColor('--gray-7')) // was --gray-5: too faint
		clrEdge = parseColor(getCssColor('--gray-9')) // was --gray-7: too faint
		// Label pills — all from CSS vars
		c2dLabelBg = cssRgba('--gray-5', 0.88) // default pill bg
		c2dLabelBgMatch = cssRgba('--accent-9', 0.9) // search match pill bg
		c2dLabelBgSelected = getCssColor('--accent-9') // selected pill bg
		c2dLabelText = getCssColor('--gray-12') // default label text
		c2dLabelTextHover = getCssColor('--gray-12') // text on gray pill
		c2dLabelTextSelected = getCssColor('--gray-1') // text on accent-9 pill
		c2dLabelTextDimmed = cssRgba('--gray-10', 0.5)
	}

	// ---------------------------------------------------------------------------
	// Shaders
	// ---------------------------------------------------------------------------

	const NODE_VERT = /* glsl */ `
		precision highp float;
		attribute vec3 position;
		attribute float aSize;
		attribute vec3 aColor;
		uniform mat4 projectionMatrix;
		uniform mat4 modelViewMatrix;
		uniform float uDpr;
		uniform float uCamZ;
		varying vec3 vColor;
		void main() {
			vColor = aColor;
			vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
			gl_PointSize = aSize * uDpr * uCamZ / max(-mvPos.z, 1.0);
			gl_Position = projectionMatrix * mvPos;
		}
	`

	const NODE_FRAG = /* glsl */ `
		precision highp float;
		varying vec3 vColor;
		void main() {
			vec2 uv = gl_PointCoord * 2.0 - 1.0;
			float d = dot(uv, uv);
			if (d > 1.0) discard;
			float alpha = 1.0 - smoothstep(0.65, 1.0, d);
			gl_FragColor = vec4(vColor, alpha);
		}
	`

	const EDGE_VERT = /* glsl */ `
		precision highp float;
		attribute vec3 position;
		attribute float aHighlight;
		uniform mat4 projectionMatrix;
		uniform mat4 modelViewMatrix;
		varying float vHighlight;
		void main() {
			vHighlight = aHighlight;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`

	const EDGE_FRAG = /* glsl */ `
		precision highp float;
		uniform vec3 uEdgeDimColor;
		uniform vec3 uEdgeHighColor;
		varying float vHighlight;
		void main() {
			vec3 color = mix(uEdgeDimColor, uEdgeHighColor, vHighlight);
			float alpha = 0.2 + vHighlight * 0.7;
			gl_FragColor = vec4(color, alpha);
		}
	`

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	function nodeRadius(node: TagGraphNode): number {
		return 4 + Math.log(node.count + 1) * 3
	}

	function getNodeColor(i: number): [number, number, number] {
		const q = searchQuery.trim().toLowerCase()
		if (q) {
			return nodes[i].label.toLowerCase().includes(q) ? clrSelected : clrDimmed
		}
		if (selectedIdx >= 0) {
			if (i === selectedIdx) return clrSelected
			if (connectedSet.has(i)) return clrConnected
			return clrDimmed
		}
		if (i === hoveredIdx) return clrHover
		return clrNode
	}

	function uploadNodeColors() {
		if (!nodeMesh || nodes.length === 0) return
		const attr = nodeMesh.geometry.attributes.aColor
		if (!attr?.data) return
		const data = attr.data
		for (let i = 0; i < nodes.length; i++) {
			const [r, g, b] = getNodeColor(i)
			data[i * 3] = r
			data[i * 3 + 1] = g
			data[i * 3 + 2] = b
		}
		attr.needsUpdate = true
	}

	function uploadEdgeColors() {
		if (!edgeMesh || edgeNodeIndices.length === 0) return
		const attr = edgeMesh.geometry.attributes.aHighlight
		if (!attr?.data) return
		const data = attr.data
		const hasSelection = selectedIdx >= 0
		for (let i = 0; i < edgeNodeIndices.length; i++) {
			const [si, ti] = edgeNodeIndices[i]
			let h: number
			if (!hasSelection) {
				h = 0.35 // default: moderate
			} else if (si === selectedIdx || ti === selectedIdx) {
				h = 1.0 // connected to selected: bright
			} else {
				h = 0.0 // unrelated: barely visible
			}
			data[i * 2] = h
			data[i * 2 + 1] = h
		}
		attr.needsUpdate = true
	}

	// ---------------------------------------------------------------------------
	// Force simulation — d3-force-3d (synchronous, 3D positions)
	// ---------------------------------------------------------------------------

	function runSimulation(nodeList: TagGraphNode[], edgeList: TagGraphEdge[]): Float32Array<ArrayBuffer> {
		const n = nodeList.length
		if (n === 0) return new Float32Array(0) as Float32Array<ArrayBuffer>

		// d3-force-3d mutates nodes in-place, adding x/y/z
		const simNodes: Array<{id: string; x?: number; y?: number; z?: number}> = nodeList.map((nd) => ({id: nd.id}))
		const simLinks = edgeList.map((e) => ({source: e.source, target: e.target}))

		const sim = forceSimulation(simNodes, 3)
			.force('charge', forceManyBody().strength(-80))
			.force(
				'link',
				forceLink(simLinks)
					.id((d: {id: string}) => d.id)
					.distance(60)
					.strength(0.5)
			)
			.force('center', forceCenter())
			.stop()

		sim.tick(Math.min(300, Math.max(100, Math.floor(8000 / n))))

		const pos = new Float32Array(n * 3) as Float32Array<ArrayBuffer>
		for (let i = 0; i < n; i++) {
			pos[i * 3] = simNodes[i].x ?? 0
			pos[i * 3 + 1] = simNodes[i].y ?? 0
			pos[i * 3 + 2] = simNodes[i].z ?? 0
		}
		return pos
	}

	/** Camera zoom to fit all sim nodes in view. */
	function fitZoom(pos: Float32Array, n: number): number {
		let maxR = 0
		for (let i = 0; i < n; i++) {
			const x = pos[i * 3],
				y = pos[i * 3 + 1],
				z = pos[i * 3 + 2]
			maxR = Math.max(maxR, Math.sqrt(x * x + y * y + z * z))
		}
		// FOV=50 → half-angle=25°; at distance D the visible radius = D*tan(25°)
		return Math.max(80, (maxR * 2.5) / Math.tan((25 * Math.PI) / 180))
	}

	// ---------------------------------------------------------------------------
	// Geometry builders
	// ---------------------------------------------------------------------------

	function buildGeometry() {
		if (!gl || nodes.length === 0) return

		const n = nodes.length
		const nPos = new Float32Array(n * 3)
		const nSizes = new Float32Array(n)
		const nColors = new Float32Array(n * 3)

		for (let i = 0; i < n; i++) {
			nPos[i * 3] = simPos[i * 3]
			nPos[i * 3 + 1] = simPos[i * 3 + 1]
			nPos[i * 3 + 2] = simPos[i * 3 + 2]
			nSizes[i] = nodeRadius(nodes[i]) * 2
			// Default color — uploadNodeColors() applies interaction state on top
			nColors[i * 3] = clrNode[0]
			nColors[i * 3 + 1] = clrNode[1]
			nColors[i * 3 + 2] = clrNode[2]
		}

		nodeMesh?.setParent(null)
		nodeMesh = null

		const nGeo = new Geometry(gl, {
			position: {size: 3, data: nPos},
			aSize: {size: 1, data: nSizes},
			aColor: {size: 3, data: nColors}
		})
		const nProg = new Program(gl, {
			vertex: NODE_VERT,
			fragment: NODE_FRAG,
			uniforms: {uDpr: {value: renderer.dpr}, uCamZ: {value: cam.zoom}},
			transparent: true,
			depthTest: false
		})
		nodeMesh = new Mesh(gl, {mode: gl.POINTS, geometry: nGeo, program: nProg})
		nodeMesh.setParent(scene)

		edgeMesh?.setParent(null)
		edgeMesh = null
		edgeNodeIndices = []

		if (edges.length > 0) {
			const idxMap: Record<string, number> = {}
			for (let i = 0; i < n; i++) idxMap[nodes[i].id] = i

			const ePos = new Float32Array(edges.length * 6)
			// 0.35 → default alpha ≈ 0.28, neutral colour; updated by uploadEdgeColors()
			const eHighlight = new Float32Array(edges.length * 2).fill(0.35)
			let vi = 0
			for (const e of edges) {
				const si = idxMap[e.source]
				const ti = idxMap[e.target]
				if (si == null || ti == null) {
					vi += 6
					continue
				}
				ePos[vi++] = simPos[si * 3]
				ePos[vi++] = simPos[si * 3 + 1]
				ePos[vi++] = simPos[si * 3 + 2]
				ePos[vi++] = simPos[ti * 3]
				ePos[vi++] = simPos[ti * 3 + 1]
				ePos[vi++] = simPos[ti * 3 + 2]
				edgeNodeIndices.push([si, ti])
			}

			const eGeo = new Geometry(gl, {
				position: {size: 3, data: ePos},
				aHighlight: {size: 1, data: eHighlight}
			})
			const eProg = new Program(gl, {
				vertex: EDGE_VERT,
				fragment: EDGE_FRAG,
				uniforms: {uEdgeDimColor: {value: clrEdge}, uEdgeHighColor: {value: clrSelected}},
				transparent: true,
				depthTest: false
			})
			edgeMesh = new Mesh(gl, {mode: gl.LINES, geometry: eGeo, program: eProg})
			edgeMesh.setParent(scene)
		}
	}

	// ---------------------------------------------------------------------------
	// 3D projection — for labels and hit testing
	// ---------------------------------------------------------------------------

	function updateVPMatrix() {
		// vpMat = projMat * viewMat  (scene is at identity)
		vpMat.copy(camera.projectionMatrix)
		vpMat.multiply(camera.viewMatrix)
	}

	function simToScreen(sx: number, sy: number, sz: number): {x: number; y: number} | null {
		const v = new Vec3(sx, sy, sz)
		v.applyMatrix4(vpMat)
		if (v.z > 1.0) return null // behind camera
		return {
			x: (v.x * 0.5 + 0.5) * canvasW,
			y: (1 - (v.y * 0.5 + 0.5)) * canvasH
		}
	}

	function hitTest(mx: number, my: number): number {
		updateVPMatrix()
		let best = -1,
			bestD2 = Infinity
		const touchR = 28 // generous touch target in CSS px
		for (let i = 0; i < nodes.length; i++) {
			const s = simToScreen(simPos[i * 3], simPos[i * 3 + 1], simPos[i * 3 + 2])
			if (!s) continue
			const dx = s.x - mx,
				dy = s.y - my
			const d2 = dx * dx + dy * dy
			if (d2 < touchR * touchR && d2 < bestD2) {
				best = i
				bestD2 = d2
			}
		}
		return best
	}

	// ---------------------------------------------------------------------------
	// 2D canvas label rendering
	// ---------------------------------------------------------------------------

	function renderLabels() {
		if (!ctx2d || nodes.length === 0 || simPos.length === 0) return
		updateVPMatrix()

		const dpr = renderer?.dpr ?? window.devicePixelRatio ?? 1
		ctx2d.clearRect(0, 0, canvasW * dpr, canvasH * dpr)
		ctx2d.save()
		ctx2d.scale(dpr, dpr)
		ctx2d.textBaseline = 'alphabetic'

		const q = searchQuery.trim().toLowerCase()
		// Apparent scale factor: at default zoom (300), scale ≈ 1
		const scaleFactor = cam.zoom / 300

		for (let i = 0; i < nodes.length; i++) {
			const s = simToScreen(simPos[i * 3], simPos[i * 3 + 1], simPos[i * 3 + 2])
			if (!s) continue
			const {x, y} = s

			if (x < -120 || x > canvasW + 120 || y < -20 || y > canvasH + 20) continue

			const isSelected = i === selectedIdx
			const isHovered = i === hoveredIdx
			const isMatch = Boolean(q && nodes[i].label.toLowerCase().includes(q))
			const isDimmed = (!isSelected && !isHovered && selectedIdx >= 0 && !connectedSet.has(i)) || Boolean(q && !isMatch)

			// Approximate apparent radius for label positioning/culling
			const baseR = nodeRadius(nodes[i])
			const apparentR = baseR * scaleFactor

			// Skip tiny dimmed nodes — reduces label clutter at overview zoom
			if (isDimmed && apparentR < 4) continue

			const fontSize = Math.max(9, Math.min(14, 8 + apparentR * 0.4))
			ctx2d.font = `${isSelected || isHovered ? '600' : '400'} ${fontSize}px system-ui,sans-serif`

			const text = nodes[i].label
			const tw = ctx2d.measureText(text).width
			const pad = 3
			const tx = x - tw / 2
			const ty = y - apparentR - 4 // baseline above the node

			const showPill = isSelected || isHovered || isMatch || apparentR >= 6
			if (showPill) {
				ctx2d.beginPath()
				ctx2d.roundRect(tx - pad, ty - fontSize, tw + pad * 2, fontSize + 3, 3)
				ctx2d.fillStyle = isSelected ? c2dLabelBgSelected : isMatch ? c2dLabelBgMatch : c2dLabelBg
				ctx2d.fill()
			}

			ctx2d.fillStyle = isDimmed
				? c2dLabelTextDimmed
				: isSelected
					? c2dLabelTextSelected
					: isMatch || isHovered
						? c2dLabelTextHover
						: c2dLabelText
			ctx2d.fillText(text, tx, ty)
		}

		ctx2d.restore()
	}

	// ---------------------------------------------------------------------------
	// RAF render loop
	// ---------------------------------------------------------------------------

	function render() {
		rafId = requestAnimationFrame(render)

		// Apply inertia when not dragging and no GSAP tween running
		if (!isDragging && !gsap.isTweening(cam)) {
			if (Math.abs(velX) > 0.0001 || Math.abs(velY) > 0.0001) {
				cam.orbitX = Math.max(-HALF_PI, Math.min(HALF_PI, cam.orbitX + velX))
				cam.orbitY += velY
				velX *= INERTIA
				velY *= INERTIA
			}
		}

		// Orbit camera: sphere of radius cam.zoom around the pan target
		camera.position.x = Math.sin(cam.orbitY) * Math.cos(cam.orbitX) * cam.zoom + cam.panX
		camera.position.y = Math.sin(cam.orbitX) * cam.zoom + cam.panY
		camera.position.z = Math.cos(cam.orbitY) * Math.cos(cam.orbitX) * cam.zoom
		camera.lookAt([cam.panX, cam.panY, 0])
		camera.updateMatrixWorld()

		if (nodeMesh?.program?.uniforms?.uCamZ) {
			nodeMesh.program.uniforms.uCamZ.value = cam.zoom
		}

		renderer.render({scene, camera})
		renderLabels()
	}

	// ---------------------------------------------------------------------------
	// Resize
	// ---------------------------------------------------------------------------

	function onResize() {
		if (!renderer || !gl) return
		canvasW = container.clientWidth
		canvasH = container.clientHeight
		renderer.setSize(canvasW, canvasH)
		camera.perspective({fov: 50, aspect: canvasW / canvasH, near: 1, far: 20000})
		if (labelCanvas) {
			const dpr = renderer.dpr
			labelCanvas.width = canvasW * dpr
			labelCanvas.height = canvasH * dpr
		}
	}

	// ---------------------------------------------------------------------------
	// Selection / fly-to
	// ---------------------------------------------------------------------------

	function selectNode(ni: number) {
		selectedIdx = ni
		connectedSet = new SvelteSet<number>()
		const nodeId = nodes[ni].id
		for (const edge of edges) {
			if (edge.source === nodeId) {
				const ti = nodes.findIndex((n) => n.id === edge.target)
				if (ti >= 0) connectedSet.add(ti)
			} else if (edge.target === nodeId) {
				const si = nodes.findIndex((n) => n.id === edge.source)
				if (si >= 0) connectedSet.add(si)
			}
		}
		uploadNodeColors()
		uploadEdgeColors()
		onNodeClick?.(nodes[ni])
		flyTo(ni)
	}

	function deselect() {
		if (selectedIdx === -1 && connectedSet.size === 0) return
		selectedIdx = -1
		connectedSet = new SvelteSet()
		uploadNodeColors()
		uploadEdgeColors()
	}

	function flyTo(ni: number) {
		const sx = simPos[ni * 3],
			sy = simPos[ni * 3 + 1],
			sz = simPos[ni * 3 + 2]
		const targetY = Math.atan2(sx, sz)
		const dist = Math.sqrt(sx * sx + sy * sy + sz * sz)
		const targetX = dist > 0.01 ? -Math.asin(sy / dist) * 0.5 : cam.orbitX
		velX = 0
		velY = 0
		gsap.killTweensOf(cam)
		gsap.to(cam, {orbitY: targetY, orbitX: targetX, panX: 0, panY: 0, duration: 0.6, ease: 'power2.out'})
	}

	// ---------------------------------------------------------------------------
	// Pointer events (orbit + tap-to-select)
	// ---------------------------------------------------------------------------

	let isDragging = false
	let dragMoved = false
	let lastPX = 0,
		lastPY = 0
	let downPX = 0,
		downPY = 0
	const activePointers = new SvelteMap<number, {x: number; y: number}>()
	let prevPinchDist = 0

	function onPointerDown(e: PointerEvent) {
		container.setPointerCapture(e.pointerId)
		activePointers.set(e.pointerId, {x: e.clientX, y: e.clientY})

		if (activePointers.size === 1) {
			isDragging = true
			dragMoved = false
			downPX = lastPX = e.clientX
			downPY = lastPY = e.clientY
			velX = 0
			velY = 0
			gsap.killTweensOf(cam)
		} else if (activePointers.size === 2) {
			isDragging = false // pinch mode
			const pts = [...activePointers.values()]
			prevPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
		}
	}

	function onPointerMove(e: PointerEvent) {
		activePointers.set(e.pointerId, {x: e.clientX, y: e.clientY})

		if (activePointers.size === 2) {
			// Two-finger pinch-zoom
			const pts = [...activePointers.values()]
			const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
			if (prevPinchDist > 0) applyZoom(dist / prevPinchDist)
			prevPinchDist = dist
			return
		}

		if (!isDragging || !activePointers.has(e.pointerId)) return

		const dx = e.clientX - lastPX
		const dy = e.clientY - lastPY
		if (Math.abs(e.clientX - downPX) > 6 || Math.abs(e.clientY - downPY) > 6) dragMoved = true

		if (e.ctrlKey) {
			// Ctrl+drag: pan the orbit center (laterally shift the scene)
			const panScale = cam.zoom / Math.max(canvasW, 1)
			cam.panX -= dx * panScale
			cam.panY += dy * panScale
			velX = 0
			velY = 0
		} else {
			// Orbit
			velX = -dy * 0.005
			velY = dx * 0.005
			cam.orbitX = Math.max(-HALF_PI, Math.min(HALF_PI, cam.orbitX + velX))
			cam.orbitY += velY
		}

		lastPX = e.clientX
		lastPY = e.clientY

		// Hover for mouse only (no hover concept on touch)
		if (e.pointerType !== 'touch') {
			const rect = container.getBoundingClientRect()
			const ni = hitTest(e.clientX - rect.left, e.clientY - rect.top)
			if (ni !== hoveredIdx) {
				hoveredIdx = ni
				uploadNodeColors()
			}
		}
	}

	function onPointerUp(e: PointerEvent) {
		const wasSingle = activePointers.size === 1
		activePointers.delete(e.pointerId)
		prevPinchDist = 0

		if (wasSingle) {
			isDragging = false
			if (!dragMoved) {
				// Tap / click — select or deselect
				const rect = container.getBoundingClientRect()
				const ni = hitTest(e.clientX - rect.left, e.clientY - rect.top)
				if (ni >= 0 && ni !== selectedIdx) selectNode(ni)
				else deselect()
				velX = 0
				velY = 0
			}
		}
	}

	function onPointerLeave() {
		if (hoveredIdx !== -1) {
			hoveredIdx = -1
			uploadNodeColors()
		}
	}

	function applyZoom(factor: number) {
		cam.zoom = Math.max(50, Math.min(15000, cam.zoom / factor))
	}

	// ---------------------------------------------------------------------------
	// Mount
	// ---------------------------------------------------------------------------

	onMount(() => {
		renderer = new Renderer({canvas: glCanvas, alpha: true, antialias: true, dpr: Math.min(window.devicePixelRatio, 2)})
		gl = renderer.gl
		gl.clearColor(0, 0, 0, 0)

		camera = new Camera(gl, {fov: 50})
		scene = new Transform()
		ctx2d = labelCanvas.getContext('2d')

		// Read theme colors from CSS vars (DOM ready here)
		readThemeColors()

		const ro = new ResizeObserver(onResize)
		ro.observe(container)
		onResize()

		// Wheel needs passive:false to call preventDefault()
		function onWheel(e: WheelEvent) {
			e.preventDefault()
			applyZoom(Math.pow(1.001, -e.deltaY))
		}
		container.addEventListener('wheel', onWheel, {passive: false})

		rafId = requestAnimationFrame(render)
		glReady = true

		return () => {
			cancelAnimationFrame(rafId)
			ro.disconnect()
			container.removeEventListener('wheel', onWheel)
			gsap.killTweensOf(cam)
		}
	})

	// Rebuild when nodes/edges change
	$effect(() => {
		if (!glReady) return
		void nodes.length
		void edges.length
		const newPos = runSimulation(nodes, edges)
		const newZoom = fitZoom(newPos, nodes.length)
		untrack(() => {
			simPos = newPos
			buildGeometry()
			uploadNodeColors()
			uploadEdgeColors()
			cam.orbitX = -0.3
			cam.orbitY = 0
			cam.zoom = newZoom
			cam.panX = 0
			cam.panY = 0
			velX = 0
			velY = 0
			selectedIdx = -1
			hoveredIdx = -1
			connectedSet = new SvelteSet()
		})
	})

	// Re-upload colors on interaction state or search change
	$effect(() => {
		void searchQuery
		void hoveredIdx
		void selectedIdx
		uploadNodeColors()
	})
</script>

<div
	bind:this={container}
	class="galaxy-wrap"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointerleave={onPointerLeave}
	role="img"
	aria-label="Tag galaxy graph"
>
	<canvas bind:this={glCanvas} class="gl-canvas"></canvas>
	<canvas bind:this={labelCanvas} class="label-canvas"></canvas>

	{#if nodes.length === 0}
		<p class="empty">No tags to display.</p>
	{/if}
</div>

<style>
	.galaxy-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		cursor: grab;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		background: var(--gray-3);
		border-radius: var(--radius-2, 4px);
	}

	.galaxy-wrap:active {
		cursor: grabbing;
	}

	.gl-canvas,
	.label-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.label-canvas {
		pointer-events: none;
	}

	.empty {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--gray-11);
		pointer-events: none;
	}
</style>
