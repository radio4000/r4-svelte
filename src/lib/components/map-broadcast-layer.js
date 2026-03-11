import maplibregl from 'maplibre-gl'

// 300 km radius → ~30px rings at zoom 2 (world view), scaling naturally with zoom
const RADIUS_METERS = 300_000
const RING_COUNT = 3

const VERTEX = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
uniform mat4 uMatrix;
void main() {
  vUv = uv;
  gl_Position = uMatrix * vec4(position, 0.0, 1.0);
}
`

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform float uTime;
uniform float uPhase;
uniform vec3 uColor;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float t = fract(uTime * 0.6 + uPhase);
  float ring = 1.0 - abs(d - t) / 0.1;
  ring = clamp(ring, 0.0, 1.0);
  float alpha = ring * (1.0 - t) * 0.85;
  outColor = vec4(uColor * alpha, alpha);
}
`

/**
 * Column-major mat4 multiply: C = A * B
 * @param {Float32Array} a @param {Float32Array} b @returns {Float32Array}
 */
function mat4mul(a, b) {
	const out = new Float32Array(16)
	for (let j = 0; j < 4; j++) {
		for (let i = 0; i < 4; i++) {
			let v = 0
			for (let k = 0; k < 4; k++) v += a[k * 4 + i] * b[j * 4 + k]
			out[j * 4 + i] = v
		}
	}
	return out
}

function readAccentColor() {
	const canvas = document.createElement('canvas')
	canvas.width = canvas.height = 1
	const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
	const div = document.createElement('div')
	div.style.color = 'var(--accent-9)'
	div.style.position = 'absolute'
	div.style.visibility = 'hidden'
	document.body.append(div)
	const raw = getComputedStyle(div).color
	div.remove()
	ctx.fillStyle = raw || '#ff8800'
	ctx.fillRect(0, 0, 1, 1)
	const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
	return new Float32Array([r / 255, g / 255, b / 255])
}

export class BroadcastLayer {
	constructor() {
		this.id = 'broadcast-3d'
		this.type = 'custom'
		this.renderingMode = '2d'
		/** @type {Array<{id: string, lng: number, lat: number}>} */
		this.channels = []
		this.startTime = performance.now()
		/** @type {maplibregl.Map | null} */
		this.map = null
		this._program = null
		this._vao = null
		this._posBuf = null
		this._uvBuf = null
		this._idxBuf = null
		this._uMatrix = null
		this._uTime = null
		this._uPhase = null
		this._uColor = null
		this.accentColor = new Float32Array([1, 0.5, 0])
	}

	/** @param {maplibregl.Map} map @param {WebGL2RenderingContext} gl */
	onAdd(map, gl) {
		this.map = map

		const vs = /** @type {WebGLShader} */ (gl.createShader(gl.VERTEX_SHADER))
		gl.shaderSource(vs, VERTEX)
		gl.compileShader(vs)
		if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS))
			console.error('[BroadcastLayer] vertex shader:', gl.getShaderInfoLog(vs))

		const fs = /** @type {WebGLShader} */ (gl.createShader(gl.FRAGMENT_SHADER))
		gl.shaderSource(fs, FRAGMENT)
		gl.compileShader(fs)
		if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS))
			console.error('[BroadcastLayer] fragment shader:', gl.getShaderInfoLog(fs))

		const prog = /** @type {WebGLProgram} */ (gl.createProgram())
		gl.attachShader(prog, vs)
		gl.attachShader(prog, fs)
		gl.linkProgram(prog)
		gl.deleteShader(vs)
		gl.deleteShader(fs)
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
			console.error('[BroadcastLayer] program link:', gl.getProgramInfoLog(prog))
		this._program = prog

		this._uMatrix = gl.getUniformLocation(prog, 'uMatrix')
		this._uTime = gl.getUniformLocation(prog, 'uTime')
		this._uPhase = gl.getUniformLocation(prog, 'uPhase')
		this._uColor = gl.getUniformLocation(prog, 'uColor')

		const positions = new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5])
		const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1])
		const indices = new Uint16Array([0, 1, 2, 0, 2, 3])

		const posLoc = gl.getAttribLocation(prog, 'position')
		const uvLoc = gl.getAttribLocation(prog, 'uv')

		this._vao = gl.createVertexArray()
		gl.bindVertexArray(this._vao)

		this._posBuf = gl.createBuffer()
		gl.bindBuffer(gl.ARRAY_BUFFER, this._posBuf)
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
		gl.enableVertexAttribArray(posLoc)
		gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

		this._uvBuf = gl.createBuffer()
		gl.bindBuffer(gl.ARRAY_BUFFER, this._uvBuf)
		gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW)
		gl.enableVertexAttribArray(uvLoc)
		gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0)

		this._idxBuf = gl.createBuffer()
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._idxBuf)
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)

		gl.bindVertexArray(null)

		this.accentColor = readAccentColor()
	}

	/** @param {WebGL2RenderingContext} gl @param {{modelViewProjectionMatrix: number[]}} options */
	render(gl, {modelViewProjectionMatrix}) {
		if (!this._program || !this._vao || !this.channels.length) return

		gl.enable(gl.BLEND)
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
		gl.disable(gl.DEPTH_TEST)
		gl.useProgram(this._program)
		gl.bindVertexArray(this._vao)

		const t = (performance.now() - this.startTime) / 1000
		gl.uniform1f(this._uTime, t)
		gl.uniform3fv(this._uColor, this.accentColor)

		const mvp = new Float32Array(modelViewProjectionMatrix)

		for (const {lng, lat} of this.channels) {
			const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0)
			const s = mc.meterInMercatorCoordinateUnits() * RADIUS_METERS * 2
			// column-major scale + translate model matrix
			const model = new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1, 0, mc.x, mc.y, mc.z, 1])
			const finalMatrix = mat4mul(mvp, model)

			for (let i = 0; i < RING_COUNT; i++) {
				gl.uniform1f(this._uPhase, i / RING_COUNT)
				gl.uniformMatrix4fv(this._uMatrix, false, finalMatrix)
				gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
			}
		}

		gl.bindVertexArray(null)
		gl.enable(gl.DEPTH_TEST)
		this.map?.triggerRepaint()
	}

	/** @param {maplibregl.Map} _map @param {WebGL2RenderingContext} gl */
	onRemove(_map, gl) {
		if (gl) {
			if (this._program) gl.deleteProgram(this._program)
			if (this._vao) gl.deleteVertexArray(this._vao)
			if (this._posBuf) gl.deleteBuffer(this._posBuf)
			if (this._uvBuf) gl.deleteBuffer(this._uvBuf)
			if (this._idxBuf) gl.deleteBuffer(this._idxBuf)
		}
		this._program = null
		this._vao = null
		this._posBuf = null
		this._uvBuf = null
		this._idxBuf = null
		this.channels = []
		this.map = null
	}

	/** @param {Array<{id: string, lng: number, lat: number}>} channels */
	setChannels(channels) {
		this.channels = channels
		if (this.map) this.map.triggerRepaint()
	}
}
