<script lang="ts">
	import {getChannelNavCtx} from '#lib/contexts.js'
	import {beforeNavigate, afterNavigate} from '$app/navigation'

	let {controls} = $props()

	let navCtx: ReturnType<typeof getChannelNavCtx> | undefined
	try {
		navCtx = getChannelNavCtx()
	} catch {
		navCtx = undefined
	}

	$effect(() => {
		if (!navCtx) return
		navCtx.setControls(controls)
		return () => navCtx!.setControls(undefined)
	})

	// Clear the page-owned snippet before teardown (layout would render it one tick
	// after its deriveds go inert), but not on same-route navs — that collapses the sticky header.
	beforeNavigate((nav) => {
		if (nav.shallow) return
		if (nav.to?.route.id !== nav.from?.route.id) navCtx?.setControls(undefined)
	})
	afterNavigate(({from, to, shallow}) => {
		if (shallow) return
		if (to?.route.id !== from?.route.id) navCtx?.setControls(controls)
	})
</script>
