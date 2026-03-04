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
		tracks?: Array<{id: string; tags?: string[] | null}>
		totalCount?: number
		channelSlug?: string
		chainTags?: string[]
		searchQuery?: string
		onTagChainChange?: (tags: string[]) => void
		onPlayTags?: (tags: string[], tracks: Array<{id: string}>) => void
		onNodeClick?: (node: TagGraphNode) => void
	}

	let {
		nodes = [],
		edges = [],
		tracks = [],
		totalCount = 0,
		channelSlug = '',
		chainTags = $bindable([]),
		searchQuery = '',
		onTagChainChange,
		onPlayTags,
		onNodeClick
	}: Props = $props()

	let container: HTMLDivElement
	let glCanvas: HTMLCanvasElement
	let labelCanvas: HTMLCanvasElement

	// Camera orbit state — plain object so GSAP can animate it
	// orbitX = pitch, orbitY = yaw, zoom = camera radius from origin
	// panX/panY = orbit center offset (Ctrl+drag)
	const cam = {orbitX: -0.3, orbitY: 0, zoom: 300, panX: 0, panY: 0, panZ: 0}

	// Inertia (applied in render loop when not dragging / not GSAP tweening)
	let velX = 0
	let velY = 0
	const INERTIA = 0.88
	const HALF_PI = Math.PI / 2

	// Hover — reactive so uploadNodeColors re-runs
	let hoveredIdx = $state(-1)
	// Connected to chain set (nodes reachable from any chain tag)
	let connectedToChainSet = new SvelteSet<number>()

	// Simulation output: Float32Array of [x,y,z, x,y,z, …]
	let simPos: Float32Array<ArrayBuffer> = new Float32Array(0) as Float32Array<ArrayBuffer>
	// Maps edge array index → [si, ti] for uploadEdgeColors(); -1 means invalid/skipped edge
	let edgeNodeIndices: Array<[number, number]> = []

	// OGL
	let renderer: InstanceType<typeof Renderer>
	let gl: OGLRenderingContext
	let camera: InstanceType<typeof Camera>
	let scene: InstanceType<typeof Transform>
	let nodeMesh: InstanceType<typeof Mesh> | null = null
	let edgeMesh: InstanceType<typeof Mesh> | null = null
	let edgeProg: InstanceType<typeof Program> | null = null
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

	// REF_DIST: world-space reference depth for point sizing.
	// At depth=REF_DIST the point appears at its "natural" CSS pixel radius.
	// Zooming in (smaller depth) → bigger nodes; zooming out → smaller. Natural perspective.
	const REF_DIST = 500

	const NODE_VERT = /* glsl */ `
		precision highp float;
		attribute vec3 position;
		attribute float aSize;
		attribute vec3 aColor;
		uniform mat4 projectionMatrix;
		uniform mat4 modelViewMatrix;
		uniform float uDpr;
		uniform float uRefDist;
		varying vec3 vColor;
		void main() {
			vColor = aColor;
			vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
			gl_PointSize = max(aSize * uDpr * uRefDist / max(-mvPos.z, 1.0), 2.0 * uDpr);
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
			// Sphere shading: treat the disc as a hemisphere facing the camera
			float z = sqrt(1.0 - d);
			vec3 normal = normalize(vec3(uv, z));
			vec3 lightDir = normalize(vec3(0.5, 0.8, 0.6));
			float diffuse = max(dot(normal, lightDir), 0.0);
			float specular = pow(max(dot(reflect(-lightDir, normal), vec3(0.0, 0.0, 1.0)), 0.0), 16.0);
			vec3 color = vColor * (0.25 + 0.75 * diffuse) + vec3(0.9) * specular * 0.35;
			gl_FragColor = vec4(color, 1.0);
		}
	`

	// Thick-line edge shader: renders each edge as a screen-space quad (6 verts, GL_TRIANGLES).
	// aPos/aOther = the two 3D endpoints; aSide = ±1 (which side of the line); aWidth = half-width px.
	const EDGE_VERT = /* glsl */ `
		precision highp float;
		attribute vec3 aPos;
		attribute vec3 aOther;
		attribute float aSide;
		attribute float aHighlight;
		attribute float aWidth;
		uniform mat4 projectionMatrix;
		uniform mat4 modelViewMatrix;
		uniform vec2 uViewport;
		varying float vHighlight;
		void main() {
			vHighlight = aHighlight;
			vec4 clipSelf  = projectionMatrix * modelViewMatrix * vec4(aPos,   1.0);
			vec4 clipOther = projectionMatrix * modelViewMatrix * vec4(aOther, 1.0);
			vec2 ndcSelf  = clipSelf.xy  / clipSelf.w;
			vec2 ndcOther = clipOther.xy / clipOther.w;
			// Screen-space direction (accounts for viewport aspect ratio)
			vec2 dirRaw = (ndcSelf - ndcOther) * uViewport;
			if (length(dirRaw) < 0.001) dirRaw = vec2(1.0, 0.0);
			vec2 dir  = normalize(dirRaw);
			vec2 perp = vec2(-dir.y, dir.x);
			// Offset in clip space (aWidth = half-width in CSS pixels)
			vec2 offset = perp * aSide * aWidth * 2.0 / uViewport * clipSelf.w;
			gl_Position = vec4(clipSelf.xy + offset, clipSelf.z, clipSelf.w);
		}
	`

	const EDGE_FRAG = /* glsl */ `
		precision highp float;
		uniform vec3 uEdgeDimColor;
		uniform vec3 uEdgeHighColor;
		varying float vHighlight;
		void main() {
			vec3 color = mix(uEdgeDimColor, uEdgeHighColor, vHighlight);
			float alpha = 0.15 + vHighlight * 0.75;
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
		const tag = nodes[i].id
		const q = searchQuery.trim().toLowerCase()
		if (q) return nodes[i].label.toLowerCase().includes(q) ? clrSelected : clrDimmed
		const chainSet = new Set(chainTags)
		if (chainSet.has(tag)) return clrSelected
		if (chainTags.length > 0) {
			return connectedToChainSet.has(i) ? clrConnected : clrDimmed
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
		const chainSet = new Set(chainTags)
		const hasChain = chainTags.length > 0
		for (let i = 0; i < edgeNodeIndices.length; i++) {
			const [si, ti] = edgeNodeIndices[i]
			if (si < 0) continue // invalid/skipped edge
			const sIn = chainSet.has(nodes[si]?.id ?? '')
			const tIn = chainSet.has(nodes[ti]?.id ?? '')
			const h = !hasChain ? 0.35 : sIn && tIn ? 1.0 : sIn || tIn ? 0.8 : 0.0
			// 6 vertices per edge quad
			for (let v = 0; v < 6; v++) data[i * 6 + v] = h
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
			uniforms: {uDpr: {value: renderer.dpr}, uRefDist: {value: REF_DIST}},
			transparent: true,
			depthTest: false
		})
		nodeMesh = new Mesh(gl, {mode: gl.POINTS, geometry: nGeo, program: nProg})
		nodeMesh.setParent(scene)

		edgeMesh?.setParent(null)
		edgeMesh = null
		edgeProg = null
		edgeNodeIndices = []

		if (edges.length > 0) {
			const idxMap: Record<string, number> = {}
			for (let i = 0; i < n; i++) idxMap[nodes[i].id] = i

			// Thick-line quads: 6 vertices per edge (2 triangles), [-1,-1] for invalid edges
			const numVerts = edges.length * 6
			const ePosArr = new Float32Array(numVerts * 3) // aPos
			const eOtherArr = new Float32Array(numVerts * 3) // aOther
			const eSideArr = new Float32Array(numVerts) // aSide ±1
			const eHighlightArr = new Float32Array(numVerts).fill(0.35) // updated by uploadEdgeColors
			const eWidthArr = new Float32Array(numVerts) // half-width in px

			// Weight range for visual width scaling
			const maxW = Math.max(1, ...edges.map((e) => e.weight))
			// Which endpoint each of the 6 triangle vertices belongs to
			const IS_A = [true, false, true, true, false, false]
			const SIDES = [-1, -1, 1, 1, -1, 1]

			let vi = 0
			for (const e of edges) {
				const si = idxMap[e.source]
				const ti = idxMap[e.target]
				if (si == null || ti == null) {
					edgeNodeIndices.push([-1, -1])
					vi += 6
					continue
				}
				edgeNodeIndices.push([si, ti])

				const ax = simPos[si * 3],
					ay = simPos[si * 3 + 1],
					az = simPos[si * 3 + 2]
				const bx = simPos[ti * 3],
					by = simPos[ti * 3 + 1],
					bz = simPos[ti * 3 + 2]
				// Half-width: 0.6–2.4px, log-scaled by weight
				const hw = 0.6 + 1.8 * (Math.log(e.weight + 1) / Math.log(maxW + 1))

				for (let v = 0; v < 6; v++, vi++) {
					const isA = IS_A[v]
					ePosArr[vi * 3] = isA ? ax : bx
					ePosArr[vi * 3 + 1] = isA ? ay : by
					ePosArr[vi * 3 + 2] = isA ? az : bz
					eOtherArr[vi * 3] = isA ? bx : ax
					eOtherArr[vi * 3 + 1] = isA ? by : ay
					eOtherArr[vi * 3 + 2] = isA ? bz : az
					eSideArr[vi] = SIDES[v]
					eWidthArr[vi] = hw
				}
			}

			const eGeo = new Geometry(gl, {
				aPos: {size: 3, data: ePosArr},
				aOther: {size: 3, data: eOtherArr},
				aSide: {size: 1, data: eSideArr},
				aHighlight: {size: 1, data: eHighlightArr},
				aWidth: {size: 1, data: eWidthArr}
			})
			edgeProg = new Program(gl, {
				vertex: EDGE_VERT,
				fragment: EDGE_FRAG,
				uniforms: {
					uEdgeDimColor: {value: clrEdge},
					uEdgeHighColor: {value: clrSelected},
					uViewport: {value: [canvasW, canvasH]}
				},
				transparent: true,
				depthTest: false
			})
			edgeMesh = new Mesh(gl, {mode: gl.TRIANGLES, geometry: eGeo, program: edgeProg})
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
		// Hit radius matches the apparent screen size of each node (same formula as renderLabels)
		const perspScale = REF_DIST / Math.max(cam.zoom, 50)
		for (let i = 0; i < nodes.length; i++) {
			const s = simToScreen(simPos[i * 3], simPos[i * 3 + 1], simPos[i * 3 + 2])
			if (!s) continue
			const dx = s.x - mx,
				dy = s.y - my
			const d2 = dx * dx + dy * dy
			const r = Math.max(12, nodeRadius(nodes[i]) * perspScale + 4)
			if (d2 < r * r && d2 < bestD2) {
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
		// CSS pixel radius matching the vertex shader: aSize * REF_DIST / depth, depth ≈ cam.zoom
		const perspScale = REF_DIST / Math.max(cam.zoom, 50)
		const chainSet = new Set(chainTags)

		// Sort nodes farthest-first so nearer labels draw on top
		const camX = camera.position.x,
			camY = camera.position.y,
			camZ = camera.position.z
		const drawOrder = Array.from({length: nodes.length}, (_, i) => {
			const dx = simPos[i * 3] - camX,
				dy = simPos[i * 3 + 1] - camY,
				dz = simPos[i * 3 + 2] - camZ
			return {i, dist2: dx * dx + dy * dy + dz * dz}
		}).sort((a, b) => b.dist2 - a.dist2)

		for (const {i} of drawOrder) {
			const s = simToScreen(simPos[i * 3], simPos[i * 3 + 1], simPos[i * 3 + 2])
			if (!s) continue
			const {x, y} = s

			if (x < -120 || x > canvasW + 120 || y < -20 || y > canvasH + 20) continue

			const isSelected = chainSet.has(nodes[i].id)
			const isHovered = i === hoveredIdx
			const isMatch = Boolean(q && nodes[i].label.toLowerCase().includes(q))
			const isDimmed =
				(!isSelected && !isHovered && chainTags.length > 0 && !connectedToChainSet.has(i)) || Boolean(q && !isMatch)

			// Apparent CSS pixel radius (matches what the shader draws)
			const baseR = nodeRadius(nodes[i])
			const apparentR = Math.max(baseR * perspScale, 1)

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
		camera.position.z = Math.cos(cam.orbitY) * Math.cos(cam.orbitX) * cam.zoom + cam.panZ
		camera.lookAt([cam.panX, cam.panY, cam.panZ])
		camera.updateMatrixWorld()

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
		if (edgeProg) edgeProg.uniforms.uViewport.value = [canvasW, canvasH]
	}

	// ---------------------------------------------------------------------------
	// Chain selection
	// ---------------------------------------------------------------------------

	function handleNodeClick(ni: number) {
		if (ni < 0 || ni >= nodes.length) return
		const tag = nodes[ni].id
		let next: string[]
		if (chainTags.includes(tag)) {
			next = chainTags.filter((t) => t !== tag) // remove from chain
		} else if (chainTags.length > 0) {
			const connected = edges.some(
				(e) => (e.source === tag && chainTags.includes(e.target)) || (e.target === tag && chainTags.includes(e.source))
			)
			next = connected ? [...chainTags, tag] : [tag] // extend or start new
		} else {
			next = [tag]
		}
		chainTags = next
		onTagChainChange?.(next)
		onNodeClick?.(nodes[ni])
		if (next.length > 0) flyTo(ni)
		rebuildConnectedSet()
		uploadNodeColors()
		uploadEdgeColors()
	}

	function clearChain() {
		chainTags = []
		onTagChainChange?.([])
		connectedToChainSet = new SvelteSet()
		uploadNodeColors()
		uploadEdgeColors()
		gsap.killTweensOf(cam)
		gsap.to(cam, {panX: 0, panY: 0, panZ: 0, duration: 0.5, ease: 'power2.out'})
	}

	function rebuildConnectedSet() {
		const next = new SvelteSet<number>()
		if (chainTags.length === 0) {
			connectedToChainSet = next
			return
		}
		const chainSet = new Set(chainTags)
		const idxMap: Record<string, number> = {}
		nodes.forEach((n, i) => {
			idxMap[n.id] = i
		})
		for (const e of edges) {
			if (chainSet.has(e.source)) {
				const i = idxMap[e.target]
				if (i != null) next.add(i)
			}
			if (chainSet.has(e.target)) {
				const i = idxMap[e.source]
				if (i != null) next.add(i)
			}
		}
		connectedToChainSet = next
	}

	// ---------------------------------------------------------------------------
	// Fly-to
	// ---------------------------------------------------------------------------

	function flyTo(ni: number) {
		const sx = simPos[ni * 3],
			sy = simPos[ni * 3 + 1],
			sz = simPos[ni * 3 + 2]
		velX = 0
		velY = 0
		gsap.killTweensOf(cam)
		// Move orbit center to the node — it appears in the viewport center
		gsap.to(cam, {panX: sx, panY: sy, panZ: sz, duration: 0.6, ease: 'power2.out'})
	}

	// ---------------------------------------------------------------------------
	// Pointer events (orbit + tap-to-select)
	// ---------------------------------------------------------------------------

	let isDragging = false
	let isPanning = false // right-button drag = pan
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
			isPanning = e.button === 2 // right-click = pan; left-click = orbit
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

		// Mouse hover — always, even when not dragging
		if (e.pointerType !== 'touch') {
			const rect = container.getBoundingClientRect()
			const ni = hitTest(e.clientX - rect.left, e.clientY - rect.top)
			if (ni !== hoveredIdx) {
				hoveredIdx = ni
				uploadNodeColors()
			}
		}

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

		if (isPanning) {
			// Right-drag: pan the orbit center
			const panScale = cam.zoom / Math.max(canvasW, 1)
			cam.panX -= dx * panScale
			cam.panY += dy * panScale
			velX = 0
			velY = 0
		} else {
			// Left-drag: orbit
			velX = -dy * 0.005
			velY = dx * 0.005
			cam.orbitX = Math.max(-HALF_PI, Math.min(HALF_PI, cam.orbitX + velX))
			cam.orbitY += velY
		}

		lastPX = e.clientX
		lastPY = e.clientY
	}

	function onPointerUp(e: PointerEvent) {
		const wasSingle = activePointers.size === 1
		activePointers.delete(e.pointerId)
		prevPinchDist = 0

		if (wasSingle) {
			isDragging = false
			if (!dragMoved) {
				// Tap / click — chain select or clear
				const rect = container.getBoundingClientRect()
				const ni = hitTest(e.clientX - rect.left, e.clientY - rect.top)
				if (ni >= 0) {
					handleNodeClick(ni)
				} else {
					clearChain()
				}
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
	// Derived — intersection count + href
	// ---------------------------------------------------------------------------

	let matchingTracks = $derived.by(() => {
		if (!chainTags.length || !tracks?.length) return []
		return tracks.filter((t) => chainTags.every((tag) => t.tags?.map((x) => x.toLowerCase()).includes(tag)))
	})

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
			// Preserve chain tags that are still valid in the new graph (e.g. URL-initialized tags)
			const validIds = new Set(nodes.map((n) => n.id))
			chainTags = chainTags.filter((t) => validIds.has(t))
			hoveredIdx = -1
			rebuildConnectedSet()
			uploadNodeColors()
			uploadEdgeColors()
			cam.orbitX = -0.3
			cam.orbitY = 0
			cam.zoom = newZoom
			cam.panX = 0
			cam.panY = 0
			cam.panZ = 0
			velX = 0
			velY = 0
		})
	})

	// Re-upload colors on hover or search change
	$effect(() => {
		void searchQuery
		void hoveredIdx
		uploadNodeColors()
	})

	// Sync colors when chainTags changes from outside (parent binding)
	$effect(() => {
		void chainTags.length
		untrack(() => {
			rebuildConnectedSet()
			uploadNodeColors()
			uploadEdgeColors()
		})
	})
</script>

<div
	bind:this={container}
	class="galaxy-wrap"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointerleave={onPointerLeave}
	oncontextmenu={(e) => e.preventDefault()}
	role="img"
	aria-label="Tag galaxy graph"
>
	<canvas bind:this={glCanvas} class="gl-canvas"></canvas>
	<canvas bind:this={labelCanvas} class="label-canvas"></canvas>

	{#if nodes.length === 0}
		<p class="empty">No tags to display.</p>
	{/if}

	{#if chainTags.length > 0}
		<aside class="chain-panel" onpointerdown={(e) => e.stopPropagation()} onpointerup={(e) => e.stopPropagation()}>
			<div class="chain-tags">
				{#each chainTags as tag, i (tag)}
					{#if i > 0}<span class="sep">→</span>{/if}
					<button class="chain-tag" onclick={() => handleNodeClick(nodes.findIndex((n) => n.id === tag))}>
						{tag} <span aria-hidden="true">×</span>
					</button>
				{/each}
				<button class="chain-clear" onclick={clearChain} aria-label="Clear chain">✕</button>
			</div>
			<div class="chain-meta">
				<span class="chain-count">{matchingTracks.length} / {totalCount}</span>
				{#if onPlayTags && matchingTracks.length > 0}
					<button onclick={() => onPlayTags?.(chainTags, matchingTracks)}>▶ Play</button>
				{/if}
				{#if channelSlug}
					<a href="/{channelSlug}/tracks?tags={chainTags.map(encodeURIComponent).join(',')}">View tracks</a>
				{/if}
			</div>
		</aside>
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

	.chain-panel {
		position: absolute;
		bottom: 0.5rem;
		left: 0.5rem;
		z-index: 2;
		background: var(--gray-2);
		border: 1px solid var(--gray-6);
		border-radius: var(--radius-2, 4px);
		padding: 0.5rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.8rem;
	}

	.chain-tags {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.sep {
		color: var(--gray-10);
	}

	.chain-tag {
		background: var(--accent-3);
		border: 1px solid var(--accent-6);
		border-radius: var(--radius-1, 3px);
		padding: 0.1rem 0.4rem;
		cursor: pointer;
		font-size: 0.8rem;
		color: var(--accent-11);
	}

	.chain-tag:hover {
		background: var(--accent-4);
	}

	.chain-clear {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--gray-10);
		padding: 0.1rem 0.3rem;
		font-size: 0.85rem;
	}

	.chain-clear:hover {
		color: var(--gray-12);
	}

	.chain-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.chain-count {
		color: var(--gray-11);
		font-variant-numeric: tabular-nums;
	}

	.chain-meta button,
	.chain-meta a {
		background: var(--gray-4);
		border: 1px solid var(--gray-6);
		border-radius: var(--radius-1, 3px);
		padding: 0.15rem 0.5rem;
		cursor: pointer;
		font-size: 0.8rem;
		color: var(--gray-12);
		text-decoration: none;
	}

	.chain-meta button:hover,
	.chain-meta a:hover {
		background: var(--gray-5);
	}
</style>
