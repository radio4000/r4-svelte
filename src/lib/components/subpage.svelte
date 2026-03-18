<script>
	import * as m from '$lib/paraglide/messages'

	/** @type {{ title: string, loading?: boolean, empty?: boolean, error?: boolean, emptyText?: string, errorText?: string, emptyChildren?: import('svelte').Snippet, children?: import('svelte').Snippet }} */
	let {
		title,
		loading = false,
		empty = false,
		error = false,
		emptyText = '',
		errorText = '',
		emptyChildren,
		children
	} = $props()
</script>

{#if loading}
	<header>
		<h1>{title}</h1>
		<p>{m.common_loading()}</p>
	</header>
{:else if error}
	<header>
		<h1>{title}</h1>
		<p>{errorText}</p>
	</header>
{:else if empty}
	<header>
		<h1>{title}</h1>
		{#if emptyChildren}
			{@render emptyChildren()}
		{:else}
			<p>{emptyText}</p>
		{/if}
	</header>
{:else}
	{@render children?.()}
{/if}

<style>
	header {
		padding: 0.5rem;
	}
</style>
