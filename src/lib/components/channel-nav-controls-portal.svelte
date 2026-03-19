<script>
	import {getChannelNavCtx} from '$lib/contexts'

	let {controls} = $props()
	const navCtx = getChannelNavCtx()

	$effect(() => {
		navCtx.setControls(controls)
		return () => navCtx.setControls(undefined)
	})
</script>
