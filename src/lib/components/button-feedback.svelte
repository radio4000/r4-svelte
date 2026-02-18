<script>
	/**
	 * A <button> that shows transient feedback after an action.
	 * @type {{
	 *   onclick: (e: MouseEvent) => void | Promise<void>,
	 *   success?: string,
	 *   error?: string,
	 *   delay?: number,
	 *   children: import('svelte').Snippet,
	 *   [key: string]: any,
	 * }}
	 */
	let {onclick, success = 'Done', error = 'Failed', delay = 2000, children, successChildren, ...rest} = $props()

	/** @type {'idle' | 'busy' | 'success' | 'error'} */
	let state = $state('idle')
	let timer

	async function handleClick(e) {
		if (state === 'busy') return
		clearTimeout(timer)
		state = 'busy'
		try {
			await onclick(e)
			state = 'success'
		} catch {
			state = 'error'
		}
		timer = setTimeout(() => (state = 'idle'), delay)
	}
</script>

<button data-feedback={state} disabled={state === 'busy'} onclick={handleClick} {...rest}>
	{#if state === 'success'}
		{#if successChildren}
			{@render successChildren()}
		{:else}
			{success}
		{/if}
	{:else if state === 'error'}
		{error}
	{:else}
		{@render children()}
	{/if}
</button>
