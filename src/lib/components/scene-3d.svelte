<script>
	import {sceneState} from '$lib/scene-state.svelte'
	import {gsap} from 'gsap'
	import {Renderer, Camera, Transform, Mesh, Program, Box, Sphere, Torus, Cylinder} from 'ogl'

	/** @type {HTMLCanvasElement} */
	let canvas = $state()

	// Mutable tween targets
	const cam = {x: 0, y: 0, z: 4}
	const camTarget = {x: 0, y: 0, z: 0}
	const bg = {r: 0, g: 0, b: 0}
	const meshRot = {speed: 0.3}
	let lightHue = 200

	// OGL objects
	/** @type {Renderer} */
	let renderer
	/** @type {Camera} */
	let camera
	/** @type {Transform} */
	let scene
	/** @type {Mesh} */
	let mesh
	/** @type {Program} */
	let program
	let rafId = -1
	let resizeObserver
	let currentGeometryName = ''
	let isSwapping = false

	const vertex = /* glsl */ `
		attribute vec3 position;
		attribute vec3 normal;
		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;
		uniform mat3 normalMatrix;
		varying vec3 vNormal;
		varying vec3 vPosition;
		void main() {
			vNormal = normalize(normalMatrix * normal);
			vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`

	const fragment = /* glsl */ `
		precision highp float;
		uniform vec3 uLightColor;
		uniform vec3 uLightDir;
		varying vec3 vNormal;
		varying vec3 vPosition;
		void main() {
			float diff = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
			vec3 color = uLightColor * (0.3 + 0.7 * diff);
			gl_FragColor = vec4(color, 1.0);
		}
	`

	/**
	 * Parse an oklch/rgb/hex color string into {r,g,b} in 0-1 range.
	 * Uses a temporary canvas2D trick for CSS colors.
	 * @param {string} colorStr
	 * @returns {{r:number,g:number,b:number}}
	 */
	function parseCssColor(colorStr) {
		if (typeof document === 'undefined') return {r: 0, g: 0, b: 0}
		const c = document.createElement('canvas')
		c.width = c.height = 1
		const ctx = c.getContext('2d')
		ctx.fillStyle = colorStr
		ctx.fillRect(0, 0, 1, 1)
		const d = ctx.getImageData(0, 0, 1, 1).data
		return {r: d[0] / 255, g: d[1] / 255, b: d[2] / 255}
	}

	/**
	 * @param {string} name
	 * @param {WebGLRenderingContext} gl
	 */
	function createGeometry(name, gl) {
		switch (name) {
			case 'sphere':
				return new Sphere(gl, {radius: 1, widthSegments: 32, heightSegments: 16})
			case 'torus':
				return new Torus(gl, {radius: 0.8, tube: 0.3, radialSegments: 32, tubularSegments: 64})
			case 'icosahedron':
				return new Cylinder(gl, {radiusTop: 0, radiusBottom: 1, height: 1.8, radialSegments: 5})
			case 'box':
			default:
				return new Box(gl, {width: 1.6, height: 1.6, depth: 1.6})
		}
	}

	async function swapGeometry(newName) {
		if (isSwapping || !mesh) return
		isSwapping = true

		// Scale out
		await gsap.to(mesh.scale, {x: 0, y: 0, z: 0, duration: 0.3, ease: 'power2.in'})

		// Swap geometry
		const oldGeo = mesh.geometry
		mesh.geometry = createGeometry(newName, renderer.gl)
		if (oldGeo && typeof oldGeo.remove === 'function') oldGeo.remove()

		currentGeometryName = newName

		// Scale in
		await gsap.to(mesh.scale, {x: 1, y: 1, z: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)'})

		isSwapping = false
	}

	function init() {
		const cfg = sceneState.current
		const initial = parseCssColor(cfg.backgroundColor ?? 'oklch(15% 0.04 260)')
		bg.r = initial.r
		bg.g = initial.g
		bg.b = initial.b

		const [cx, cy, cz] = cfg.cameraPosition ?? [0, 0, 4]
		cam.x = cx
		cam.y = cy
		cam.z = cz
		meshRot.speed = cfg.rotationSpeed ?? 0.3

		renderer = new Renderer({canvas, alpha: false, antialias: true})
		const gl = renderer.gl

		// Initial clear color
		gl.clearColor(bg.r, bg.g, bg.b, 1)

		camera = new Camera(gl, {fov: 45})
		camera.position.set(cam.x, cam.y, cam.z)
		camera.lookAt([0, 0, 0])

		scene = new Transform()

		program = new Program(gl, {
			vertex,
			fragment,
			uniforms: {
				uLightColor: {value: [1, 1, 1]},
				uLightDir: {value: [1, 1.5, 2]}
			}
		})

		const geometry = createGeometry(cfg.geometry, gl)
		currentGeometryName = cfg.geometry
		mesh = new Mesh(gl, {geometry, program})
		mesh.setParent(scene)

		// Resize
		function resize() {
			const w = canvas.parentElement?.clientWidth ?? window.innerWidth
			const h = canvas.parentElement?.clientHeight ?? window.innerHeight
			renderer.setSize(w, h)
			camera.perspective({aspect: w / h})
		}
		resize()
		resizeObserver = new ResizeObserver(resize)
		resizeObserver.observe(canvas.parentElement ?? document.documentElement)

		// Render loop
		let lastTime = 0
		function loop(time) {
			rafId = requestAnimationFrame(loop)
			const dt = Math.min((time - lastTime) / 1000, 0.1)
			lastTime = time

			// Light hue cycling
			if (sceneState.current.lightCycling !== false) {
				lightHue = (lightHue + 30 * dt) % 360
				const [lr, lg, lb] = hslToRgb(lightHue, 0.7, 0.7)
				program.uniforms.uLightColor.value = [lr, lg, lb]
			} else {
				program.uniforms.uLightColor.value = [1, 1, 1]
			}

			// Apply tweened bg
			gl.clearColor(bg.r, bg.g, bg.b, 1)

			// Apply tweened camera
			camera.position.set(cam.x, cam.y, cam.z)
			camera.lookAt([camTarget.x, camTarget.y, camTarget.z])

			// Rotate mesh
			if (mesh) {
				mesh.rotation.y += meshRot.speed * dt
				mesh.rotation.x += meshRot.speed * 0.3 * dt
			}

			renderer.render({scene, camera})
		}
		rafId = requestAnimationFrame(loop)
	}

	/** @param {number} h @param {number} s @param {number} l */
	function hslToRgb(h, s, l) {
		h = h / 360
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s
		const p = 2 * l - q
		return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)]
	}

	/** @param {number} p @param {number} q @param {number} t */
	function hue2rgb(p, q, t) {
		if (t < 0) t += 1
		if (t > 1) t -= 1
		if (t < 1 / 6) return p + (q - p) * 6 * t
		if (t < 1 / 2) return q
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
		return p
	}

	// React to scene config changes
	let prevConfig = null
	$effect(() => {
		const cfg = sceneState.current

		if (!renderer) return

		// Camera position
		const [cx, cy, cz] = cfg.cameraPosition ?? [0, 0, 4]
		gsap.to(cam, {x: cx, y: cy, z: cz, duration: 1.5, ease: 'power2.inOut', overwrite: true})

		// Camera target
		const [tx, ty, tz] = cfg.cameraTarget ?? [0, 0, 0]
		gsap.to(camTarget, {x: tx, y: ty, z: tz, duration: 1.5, ease: 'power2.inOut', overwrite: true})

		// Background color
		const parsed = parseCssColor(cfg.backgroundColor ?? 'oklch(15% 0.04 260)')
		gsap.to(bg, {r: parsed.r, g: parsed.g, b: parsed.b, duration: 1.2, ease: 'power2.inOut', overwrite: true})

		// Rotation speed
		gsap.to(meshRot, {speed: cfg.rotationSpeed ?? 0.3, duration: 0.8, overwrite: true})

		// Geometry swap
		if (prevConfig && cfg.geometry !== prevConfig.geometry) {
			swapGeometry(cfg.geometry)
		}

		prevConfig = {...cfg}
	})

	$effect(() => {
		if (!canvas) return
		init()
		return () => {
			cancelAnimationFrame(rafId)
			resizeObserver?.disconnect()
			gsap.killTweensOf([cam, camTarget, bg, meshRot])
			if (mesh) gsap.killTweensOf(mesh.scale)
			renderer?.gl.getExtension('WEBGL_lose_context')?.loseContext()
		}
	})
</script>

<canvas bind:this={canvas} class="scene-canvas" aria-hidden="true"></canvas>

<style>
	.scene-canvas {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 0;
		pointer-events: none;
		display: block;
	}
</style>
