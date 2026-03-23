import devtoolsJson from 'vite-plugin-devtools-json'
import {sveltekit} from '@sveltejs/kit/vite'
import {defineConfig} from 'vitest/config'
import {execSync} from 'child_process'
import {paraglideVitePlugin} from '@inlang/paraglide-js'
import {visualizer} from 'rollup-plugin-visualizer'
import {SvelteKitPWA} from '@vite-pwa/sveltekit'
import pkg from './package.json'

// Get git info at build time
function getGitInfo() {
	try {
		const sha = execSync('git rev-parse --short HEAD').toString().trim()
		const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
		const date = execSync('git log -1 --format=%cI').toString().trim()
		const remoteUrl = execSync('git config --get remote.origin.url').toString().trim()
		return {sha, branch, date, remoteUrl}
	} catch (e) {
		console.warn('Failed to get git info:', e.message)
		return {sha: 'unknown', branch: 'unknown', date: 'unknown', remoteUrl: 'unknown'}
	}
}

export default defineConfig({
	plugins: [
		sveltekit(),
		paraglideVitePlugin({
			project: './i18n/project.inlang',
			outdir: './src/lib/paraglide'
		}),
		SvelteKitPWA({
			manifest: false,
			registerType: 'prompt',
			injectRegister: null,
			workbox: {
				clientsClaim: true,
				navigateFallback: null,
				globPatterns: ['client/**/*.{js,css,ico,png,svg,woff2,webp,webmanifest}'],
				globIgnores: ['**/*.html'],
				// Pages are fetched from the network first (always fresh when online).
				// The cache is only used as an offline fallback or when the network is slow (>5s).
				runtimeCaching: [
					{
						urlPattern: ({request}) => request.mode === 'navigate',
						handler: 'NetworkFirst',
						options: {
							cacheName: 'pages',
							networkTimeoutSeconds: 5,
							expiration: {maxEntries: 50, maxAgeSeconds: 60 * 60 * 24}
						}
					}
				]
			}
		}),
		devtoolsJson(),
		...(process.env.ANALYZE
			? [
					visualizer({
						filename: 'rollup-visualizer.html',
						gzipSize: true,
						brotliSize: true
					})
				]
			: [])
	],
	worker: {
		format: 'es'
	},
	build: {
		target: 'esnext',
		reportCompressedSize: false
	},
	define: {
		__GIT_INFO__: JSON.stringify(getGitInfo()),
		__REPO_URL__: JSON.stringify(pkg.repository)
	},
	test: {
		reporters: ['dot'],
		onConsoleLog: () => false
	}
})
