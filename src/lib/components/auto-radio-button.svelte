<script lang="ts">
	import Icon from '#lib/components/icon.svelte'
	import PresenceCount from '#lib/components/presence-count.svelte'
	import {tooltip} from '#lib/components/tooltip-attachment.svelte.js'
	import * as m from '#lib/paraglide/messages.js'

	let {
		live = false,
		drifted = false,
		count = 0,
		title,
		ariaLabel,
		size = 16,
		showLabel = false,
		class: className = '',
		...rest
	}: {
		live?: boolean
		drifted?: boolean
		count?: number
		title?: string
		ariaLabel?: string
		size?: number
		showLabel?: boolean
		class?: string
		[key: string]: unknown
	} = $props()

	// Active = engaged and in sync. Drifted reads as a resync call-to-action, so it drops active.
	// Live + synced = a toggle: clicking leaves auto-radio.
	const resolvedTitle = $derived(
		title ?? (drifted ? m.auto_radio_resync() : live ? m.auto_radio_leave() : m.auto_radio_join())
	)
	const resolvedAriaLabel = $derived(ariaLabel ?? resolvedTitle)
	// Only surface the badge when others are present (count includes you).
	const showCount = $derived(count > 1)
</script>

<button
	type="button"
	class={['auto-live-btn', {active: live && !drifted}, className]}
	aria-label={resolvedAriaLabel}
	{...rest}
	{@attach tooltip({content: resolvedTitle})}
>
	<Icon icon="infinite" {size} />
	{#if showLabel}
		<span>{m.common_auto()}</span>
	{/if}
	{#if showCount}
		<PresenceCount {count} corner />
	{/if}
</button>
