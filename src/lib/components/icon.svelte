<script>
	/** @type {{icon: string, title?: string, className?: string, size?: string | number, children?: any, [key: string]: any}} */
	const {children, icon = '', title, className = '', size, ...rest} = $props()

	function toImportName(str, prefix = 'Icon') {
		const parts = str.split('-')
		for (let i = 0; i < parts.length; i++) {
			parts[i] = parts[i].charAt(0).toUpperCase() + parts[i].slice(1)
		}
		parts.unshift(prefix)
		return parts.join('')
	}

	/** @type {Promise<typeof import('obra-icons-svelte')>} */
	const iconsModule = import('obra-icons-svelte')

	/** @type {import('svelte').Component | null} */
	let Icon = $state(null)

	$effect(() => {
		if (!icon) {
			Icon = null
			return
		}
		const iconName = toImportName(icon)
		iconsModule.then((module) => {
			Icon = module[iconName] ?? null
		})
	})
</script>

<i class={`icon ${className}`} class:icon {title}>
	{#if Icon}
		<Icon {size} {...rest} />
	{/if}
	{#if children}
		{@render children()}
	{/if}
</i>

<style>
	.icon {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		font-style: normal;
	}
</style>
