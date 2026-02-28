<script lang="ts">
	import Icon from '$lib/components/icon.svelte'

	let {
		synced = false,
		title = 'Auto radio',
		ariaLabel,
		size = 16,
		className = '',
		...rest
	}: {
		synced?: boolean
		title?: string
		ariaLabel?: string
		size?: number
		className?: string
		[key: string]: unknown
	} = $props()

	const resolvedAriaLabel = $derived(ariaLabel ?? title)
	const classNames = $derived(['auto-live-btn', className, synced ? 'ghost' : ''].filter(Boolean).join(' '))
</script>

<button type="button" class={classNames} {title} aria-label={resolvedAriaLabel} {...rest}>
	<Icon icon="infinite" {size} />
</button>
