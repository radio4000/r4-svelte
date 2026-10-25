/**
 * Paint the browser chrome / phone status bar with the page background.
 * The <meta name="theme-color"> tags in app.html follow the OS colour scheme,
 * but the app has its own light/dark toggle and a theme editor, so we read the
 * real background after they apply and write it back as sRGB (a 1px canvas
 * converts oklch/light-dark(), which not every browser takes in theme-color).
 */
export function syncThemeColor() {
	const background = getComputedStyle(document.documentElement).backgroundColor
	const ctx = document.createElement('canvas').getContext('2d', {willReadFrequently: true})
	if (!ctx) return
	ctx.fillStyle = background
	ctx.fillRect(0, 0, 1, 1)
	const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
	const color = `rgb(${r} ${g} ${b})`
	for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
		meta.setAttribute('content', color)
	}
}
