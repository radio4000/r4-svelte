import * as child_process from 'node:child_process'
import {vitePreprocess} from '@sveltejs/vite-plugin-svelte'
import adapter from '@sveltejs/adapter-cloudflare'

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// https://svelte.dev/docs/kit/integrations
	preprocess: vitePreprocess(),

	server: {
		// By setting host:true, you can do `bun run dev --host` and debug locally
		host: true
	},

	kit: {
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter(),

		version: {
			name: child_process.execSync('git rev-parse HEAD').toString().trim()
		}
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
}

export default config
