<script>
	import {onMount} from 'svelte'
	import {updated} from '$app/state'
	import {resolve} from '$app/paths'
	import {repoCompareUrl} from '#lib/repo.js'
	import * as m from '#lib/paraglide/messages.js'

	/** @type {((reloadPage?: boolean) => Promise<void>) | undefined} */
	let updateSW
	let dismissed = $state(false)
	let reloading = $state(false)
	let deployedSha = $state('')

	// True only when the deployed `_app/version.json` differs from this page's
	// build. The service worker is deliberately not the trigger: pages are
	// network-first, so a fresh load already runs the latest code even while a
	// new worker sits waiting.
	const visible = $derived(updated.current && !dismissed)

	const {sha} = __GIT_INFO__
	// Compare this page's build against the deployed sha, not `main` — the
	// deployed build can sit beside `main` and show an empty diff.
	const compareUrl = $derived(deployedSha ? repoCompareUrl(sha, deployedSha) : '')

	onMount(() => {
		/** @type {ReturnType<typeof setInterval> | undefined} */
		let interval
		import('virtual:pwa-register').then(({registerSW}) => {
			updateSW = registerSW({
				immediate: true,
				onRegisteredSW(_url, registration) {
					if (!registration) return
					// Browsers only look for a new service worker on full page loads,
					// so a long-lived tab has to ask on its own schedule.
					interval = setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000)
				},
				onNeedRefresh() {
					// A new service worker is waiting — a deploy happened. Whether this
					// page is stale too is decided by the version check above.
					updated.check()
				},
				onRegisterError(error) {
					console.warn('Service worker registration failed', error)
				}
			})
		})
		return () => clearInterval(interval)
	})

	$effect(() => {
		if (!visible || deployedSha) return
		fetch(resolve(/** @type {any} */ ('_app/version.json')), {cache: 'no-store'})
			.then((r) => r.json())
			.then((v) => (deployedSha = v.version))
			.catch(() => {})
	})

	function reload() {
		reloading = true
		// Activate the waiting service worker; it reloads the page when it takes
		// control. If there is no waiting worker (or the message goes nowhere),
		// the timeout reloads anyway — the click always does something.
		updateSW?.(true)
		setTimeout(() => window.location.reload(), 1500)
	}
</script>

{#if visible}
	<div data-sw-update role="status">
		<span>{m.app_update_available()}</span>
		<menu>
			<button onclick={reload} disabled={reloading}>{m.app_update_reload()}</button>
			<button onclick={() => (dismissed = true)}>{m.app_update_dismiss()}</button>
		</menu>
		{#if compareUrl}
			<a class="link" href={compareUrl} target="_blank" rel="noreferrer">{m.app_update_changes()}</a
			>
		{/if}
	</div>
{/if}

<style>
	[data-sw-update] {
		max-width: 50ch;
		position: fixed;
		top: var(--space-1);
		right: var(--space-1);
		z-index: 9999;
		display: flex;
		flex-flow: column;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--accent-3);
		border: 1px solid
			color-mix(in oklch, var(--accent-6) calc(var(--border-opacity) * 100%), transparent);
		border-radius: var(--border-radius);
	}
</style>
