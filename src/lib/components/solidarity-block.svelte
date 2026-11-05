<script>
	import * as m from '#lib/paraglide/messages.js'
	import Dialog from '#lib/components/dialog.svelte'
	import LanguageSwitcher from '#lib/components/language-switcher.svelte'

	let showModal = $state(true)
</script>

<Dialog bind:showModal closable={false}>
	{#snippet header()}
		<h2>{m.solidarity_title()}</h2>
	{/snippet}
	<p>{m.solidarity_body()}</p>
	<p>{m.solidarity_back()}</p>
	{#snippet footer()}
		<LanguageSwitcher />
	{/snippet}
</Dialog>
