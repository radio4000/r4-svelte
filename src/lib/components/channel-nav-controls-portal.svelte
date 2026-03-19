<script lang="ts">
	import {getChannelNavCtx} from '$lib/contexts'

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
</script>
