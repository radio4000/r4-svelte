<script lang="ts">
	import {channelAvatarUrl} from '#lib/utils.js'

	// Subtle canvas backdrop that echoes a channel avatar's colors. Samples the
	// (already cached) 250px avatar down to a tiny grid, quantizes into a few
	// dominant colors, then paints them as bold diagonal brush strokes, plus a
	// paper-grain overlay. Renders once per image — no animation loop, no reflow.
	//
	// Dull or single-hue palettes get an adaptive pass that fans the hues apart
	// and forces saturation, so muddy/monochrome avatars become contrasting
	// warm/cool marks instead of one flat tint.
	let {id}: {id?: string | null} = $props()

	// Low-res canvas, CSS-stretched. Small = fast + free blur on upscale.
	const W = 120
	const H = 64

	let canvas = $state<HTMLCanvasElement | undefined>(undefined)

	type Raw = {r: number; g: number; b: number; x: number; y: number; weight: number; sat: number}
	type Stroke = {r: number; g: number; b: number; x: number; y: number; weight: number}
	// 'loading' while an avatar is in flight, so we don't flash the fallback
	// before the real colours land; 'fallback' when there's no/failed image.
	let rawStrokes = $state<Raw[]>([])
	let status = $state<'loading' | 'ready' | 'fallback'>('loading')
	let painted = $state(false) // first-paint fade-in

	// --- Load + sample the avatar ---
	$effect(() => {
		const el = canvas
		if (!el) return
		if (!id) {
			rawStrokes = []
			status = 'fallback'
			return
		}

		status = 'loading'
		let cancelled = false
		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.src = channelAvatarUrl(id, 250)

		const run = () => {
			if (cancelled) return
			try {
				const strokes = sample(img)
				if (strokes.length) {
					rawStrokes = strokes
					status = 'ready'
				} else {
					status = 'fallback'
				}
			} catch {
				status = 'fallback' // CORS / decode failure
			}
		}

		if (img.complete && img.naturalWidth) {
			queueMicrotask(run)
		} else {
			img.onload = run
			img.onerror = () => {
				if (!cancelled) status = 'fallback'
			}
		}

		return () => {
			cancelled = true
			img.onload = null
			img.onerror = null
		}
	})

	// --- Repaint when colours/status change ---
	$effect(() => {
		const el = canvas
		if (!el) return
		if (status === 'loading') return // keep prior frame until colours arrive
		if (status === 'ready' && rawStrokes.length) paintStrokes(el, processStrokes(rawStrokes))
		else drawFallback(el)
		painted = true
	})

	// Downscale to a small grid, bucket colours coarsely, keep each bucket's
	// average colour + position + weight + saturation.
	function sample(img: HTMLImageElement): Raw[] {
		const N = 16
		const tmp = document.createElement('canvas')
		tmp.width = N
		tmp.height = N
		const ctx = tmp.getContext('2d')
		if (!ctx) return []
		ctx.drawImage(img, 0, 0, N, N)
		const {data} = ctx.getImageData(0, 0, N, N)

		const buckets: Record<number, Raw> = {}
		for (let i = 0; i < data.length; i += 4) {
			if (data[i + 3] < 16) continue
			const r = data[i]
			const g = data[i + 1]
			const b = data[i + 2]
			const max = Math.max(r, g, b)
			const min = Math.min(r, g, b)
			const sat = max === 0 ? 0 : (max - min) / max
			const px = (i / 4) % N
			const py = Math.floor(i / 4 / N)
			const key = ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6)
			const weight = 0.3 + sat // saturated pixels count more
			const bkt = (buckets[key] ??= {r: 0, g: 0, b: 0, x: 0, y: 0, sat: 0, weight: 0})
			bkt.r += r * weight
			bkt.g += g * weight
			bkt.b += b * weight
			bkt.x += px * weight
			bkt.y += py * weight
			bkt.sat += sat * weight
			bkt.weight += weight
		}

		return Object.values(buckets)
			.map((b) => ({
				r: b.r / b.weight,
				g: b.g / b.weight,
				b: b.b / b.weight,
				x: b.x / b.weight / (N - 1),
				y: b.y / b.weight / (N - 1),
				sat: b.sat / b.weight,
				weight: b.weight
			}))
			.sort((a, b) => b.weight - a.weight)
			.slice(0, 5)
	}

	// Turn raw colours into paint colours. Varied, vivid palettes get a mild
	// punch. Dull (low-saturation) OR single-hue palettes get their hues fanned
	// apart around the dominant hue + saturation forced — so a beige/taupe or
	// all-one-colour avatar becomes contrasting warm/cool marks rather than five
	// near-identical blobs.
	function processStrokes(raw: Raw[]): Stroke[] {
		const n = raw.length
		const totalWeight = raw.reduce((s, r) => s + r.weight, 0)
		const colorfulness = raw.reduce((s, r) => s + r.sat * r.weight, 0) / totalWeight

		// Hue concentration via mean resultant length of the (saturated) hues:
		// ~1 = all one hue (monochrome), ~0 = spread across the wheel.
		let sx = 0
		let sy = 0
		let hueWeight = 0
		let baseHue = 0
		for (const r of raw) {
			if (r.sat < 0.15) continue
			const [h] = rgbToHsl(r.r, r.g, r.b)
			const rad = (h * Math.PI) / 180
			sx += Math.cos(rad) * r.weight
			sy += Math.sin(rad) * r.weight
			hueWeight += r.weight
		}
		const concentration = hueWeight ? Math.hypot(sx, sy) / hueWeight : 0
		if (hueWeight) baseHue = (Math.atan2(sy, sx) * 180) / Math.PI

		// Genuinely achromatic (black/white logos, grayscale art): almost no
		// saturated pixels means there's no hue to honour. Inventing one would
		// paint pink/orange onto a monochrome avatar, so keep neutral greys.
		const chromaShare = hueWeight / totalWeight
		const achromatic = chromaShare < 0.12

		// Fan applies only when there IS a hue to spread — otherwise we'd
		// fabricate colour. Achromatic avatars skip it.
		const fan = !achromatic && (colorfulness < 0.22 || concentration > 0.82)

		return raw.map((s, i) => {
			let {r, g, b} = s
			if (achromatic) {
				// Spread the greys' lightness a touch so strokes stay distinct.
				const [, , l] = rgbToHsl(r, g, b)
				const light = Math.min(Math.max(l + (i - (n - 1) / 2) * 0.06, 0.18), 0.85)
				;[r, g, b] = hslToRgb(0, 0, light)
			} else if (fan) {
				const [, , l] = rgbToHsl(r, g, b)
				const fanned = (baseHue + (i - (n - 1) / 2) * 24 + 360) % 360
				const light = Math.min(Math.max(l, 0.45), 0.72)
				;[r, g, b] = hslToRgb(fanned, 0.45, light)
			} else {
				const mean = (r + g + b) / 3
				const punch = 1.45
				r = clamp(mean + (r - mean) * punch)
				g = clamp(mean + (g - mean) * punch)
				b = clamp(mean + (b - mean) * punch)
			}
			return {r, g, b, x: s.x, y: s.y, weight: s.weight}
		})
	}

	// Bold, clearly-oriented diagonal sweeps — reads as paint regardless of
	// how vivid the source is.
	function paintStrokes(el: HTMLCanvasElement, strokes: Stroke[]) {
		const ctx = reset(el)
		if (!ctx) return
		const n = strokes.length
		strokes.forEach((s, i) => {
			const cx = ((i + 0.5) / n) * W
			const cy = (0.3 + (i % 2) * 0.4) * H
			const radius = W * 0.6
			const angle = -0.5 + i * 0.14 // diagonal fan
			const alpha = 0.62 - i * 0.08
			blob(ctx, cx, cy, radius, angle, [3.2, 0.42], s, alpha)
		})
	}

	function blob(
		ctx: CanvasRenderingContext2D,
		cx: number,
		cy: number,
		radius: number,
		angle: number,
		[sx, sy]: [number, number],
		s: Stroke,
		alpha: number
	) {
		ctx.save()
		ctx.translate(cx, cy)
		ctx.rotate(angle)
		ctx.scale(sx, sy)
		const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
		grad.addColorStop(0, `rgba(${s.r}, ${s.g}, ${s.b}, ${alpha})`)
		grad.addColorStop(1, `rgba(${s.r}, ${s.g}, ${s.b}, 0)`)
		ctx.fillStyle = grad
		ctx.fillRect(-radius * 2, -radius * 2, radius * 4, radius * 4)
		ctx.restore()
	}

	function reset(el: HTMLCanvasElement) {
		el.width = W // assigning size also clears the backing store
		el.height = H
		return el.getContext('2d')
	}

	// No avatar / failed load — quiet wash from the theme accent.
	function drawFallback(el: HTMLCanvasElement) {
		const ctx = reset(el)
		if (!ctx) return
		const grad = ctx.createRadialGradient(W * 0.2, H * 0.3, 0, W * 0.2, H * 0.3, W * 0.8)
		grad.addColorStop(0, resolveColor(el, 'var(--accent-9)') || 'rgb(128, 128, 160)')
		grad.addColorStop(1, 'transparent')
		ctx.globalAlpha = 0.4
		ctx.fillStyle = grad
		ctx.fillRect(0, 0, W, H)
	}

	// Custom props can resolve to canvas-unparseable values like
	// `light-dark(oklch(...), oklch(...))`. Set it as a real `color` on a probe
	// element and read it back as a concrete rgb() string.
	function resolveColor(near: HTMLElement, value: string): string {
		const probe = document.createElement('span')
		probe.style.cssText = `color:${value};display:none`
		;(near.parentElement ?? document.body).appendChild(probe)
		const rgb = getComputedStyle(probe).color
		probe.remove()
		return rgb
	}

	function clamp(v: number) {
		return Math.max(0, Math.min(255, Math.round(v)))
	}

	function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
		r /= 255
		g /= 255
		b /= 255
		const max = Math.max(r, g, b)
		const min = Math.min(r, g, b)
		const d = max - min
		let h = 0
		if (d !== 0) {
			if (max === r) h = ((g - b) / d) % 6
			else if (max === g) h = (b - r) / d + 2
			else h = (r - g) / d + 4
			h *= 60
			if (h < 0) h += 360
		}
		const l = (max + min) / 2
		const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
		return [h, s, l]
	}

	function hslToRgb(h: number, s: number, l: number): [number, number, number] {
		const c = (1 - Math.abs(2 * l - 1)) * s
		const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
		const m = l - c / 2
		let r: number, g: number, b: number
		if (h < 60) [r, g, b] = [c, x, 0]
		else if (h < 120) [r, g, b] = [x, c, 0]
		else if (h < 180) [r, g, b] = [0, c, x]
		else if (h < 240) [r, g, b] = [0, x, c]
		else if (h < 300) [r, g, b] = [x, 0, c]
		else [r, g, b] = [c, 0, x]
		return [clamp((r + m) * 255), clamp((g + m) * 255), clamp((b + m) * 255)]
	}
</script>

<div class="channel-canvas-bg" class:painted>
	<canvas bind:this={canvas} class="wash" aria-hidden="true"></canvas>
	<div class="grain" aria-hidden="true"></div>
</div>

<style>
	.channel-canvas-bg {
		position: absolute;
		inset: -5%;
		width: 110%;
		height: 110%;
		z-index: 0;
		pointer-events: none;
		overflow: hidden;
		opacity: 0;
	}

	/* Fade in once the first frame is painted */
	.channel-canvas-bg.painted {
		opacity: 1;
	}

	.wash {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0.3;
		filter: blur(10px) saturate(1.25);
		/* Fade edges so strokes melt into the bar instead of forming a hard band */
		mask-image: radial-gradient(120% 130% at 50% 30%, black 35%, transparent 95%);
	}

	.grain {
		position: absolute;
		inset: 0;
		mix-blend-mode: overlay;
		opacity: 0.12;
		filter: blur(1px);
		background-size: 160px 160px;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		mask-image: radial-gradient(120% 130% at 50% 30%, black 35%, transparent 95%);
	}

	@media (prefers-reduced-motion: no-preference) {
		.channel-canvas-bg {
			transition: opacity 0.6s ease;
		}
	}
</style>
