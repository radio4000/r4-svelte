import devtoolsJson from 'vite-plugin-devtools-json'
import {sveltekit} from '@sveltejs/kit/vite'
import {vitePreprocess} from '@sveltejs/vite-plugin-svelte'
import adapterCloudflare from '@sveltejs/adapter-cloudflare'
import adapterStatic from '@sveltejs/adapter-static'
import {defineConfig} from 'vitest/config'
import {execSync} from 'child_process'
import {paraglideVitePlugin} from '@inlang/paraglide-js'
import {visualizer} from 'rollup-plugin-visualizer'
import pkg from './package.json' with {type: 'json'}

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

const standalone = process.env.PUBLIC_APP_MODE === 'standalone'

export default defineConfig({
	plugins: [
		sveltekit({
			// https://svelte.dev/docs/kit/integrations
			preprocess: vitePreprocess(),
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: standalone ? adapterStatic({fallback: '404.html'}) : adapterCloudflare(),
			paths: standalone ? {base: (process.env.BASE_PATH ?? '') as '' | `/${string}`} : {},
			version: {
				name: execSync('git rev-parse HEAD').toString().trim(),
				// Poll `_app/version.json` so long-lived tabs notice new deploys.
				// Drives `updated.current`, which the app update banner listens to.
				pollInterval: 5 * 60 * 1000
			},
			compilerOptions: {
				experimental: {
					// https://svelte.dev/docs/svelte/await-expressions
					async: true
				},
				warningFilter: (warning) => {
					const ignore = [
						'a11y_click_events_have_key_events',
						'a11y_no_static_element_interactions',
						'a11y_no_noninteractive_element_interactions',
						'a11y_autofocus'
					]
					return !ignore.includes(warning.code)
				}
			}
		}),
		paraglideVitePlugin({
			project: './i18n/project.inlang',
			outdir: './src/lib/paraglide'
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
	optimizeDeps: {
		// MapLibre 6 resolves its ESM worker via import.meta.url, which Vite's prebundler drops in dev.
		exclude: ['maplibre-gl']
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
