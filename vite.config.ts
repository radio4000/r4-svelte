import devtoolsJson from 'vite-plugin-devtools-json'
import {sveltekit} from '@sveltejs/kit/vite'
import {defineConfig} from 'vite'
import {execSync} from 'child_process'
import wasm from 'vite-plugin-wasm'

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
	plugins: [wasm(), sveltekit(), devtoolsJson()],
	optimizeDeps: {
		// https://pglite.dev/docs/bundler-support#vite
		exclude: ['@electric-sql/pglite']
	},
	worker: {
		format: 'es'
	},
	build: {
		target: 'esnext'
	},
	define: {
		__GIT_INFO__: JSON.stringify(getGitInfo())
	}
})
