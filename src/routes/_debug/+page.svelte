<script>
	const pages = [
		{href: 'appstate', title: 'appState', desc: 'Inspect and mutate live app state'},
		{href: 'async-test', title: 'Async', desc: 'Async patterns and loading states'},
		{href: 'buttons', title: 'Buttons', desc: 'clickity click clack'},
		{href: 'cards', title: 'Cards', desc: 'Track and channel card variants'},
		{href: 'canvas', title: 'Canvas', desc: 'Canvas rendering experiments'},
		{href: 'decks', title: 'Decks', desc: 'Deck tracklist playground'},
		{href: 'keyboard-list-navigation', title: 'Listbox nav', desc: 'Keyboard-driven list navigation'},
		{href: 'livequery-perf', title: 'Live query', desc: 'TanStack live query benchmarks'},
		{href: 'media-chrome', title: 'Player chrome', desc: 'Media player UI components'},
		{href: 'spam-angel', title: 'Spam', desc: 'Spam detection tools'},
		{href: 'tanstack', title: 'Tanstack', desc: 'TanStack DB collections and queries'},
		{href: 'tooltips', title: 'Tooltips', desc: 'Tooltip positioning and behavior'},
		{href: 'styles', title: 'Styles', desc: 'Global style reference'},
		{href: 'views', title: 'Views', desc: 'Saved view CRUD and filtering'}
	]
</script>

<svelte:head>
	<title>Debug</title>
</svelte:head>

<div class="constrained container">
	<h1>Debug</h1>
	<menu class="nav-options">
		{#each pages as { href, title, desc } (href)}
			<a href="/_debug/{href}">
				<h3>{title}</h3>
				<p>{desc}</p>
			</a>
		{/each}
	</menu>
</div>
