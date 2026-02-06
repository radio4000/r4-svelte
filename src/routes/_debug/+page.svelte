<svelte:head>
	<title>Debug</title>
</svelte:head>

<div class="container">
	<nav data-grouped class="horizontalOverflow">
		<a class="active" href="/_debug">DEBUG</a>
		<a href="/_debug/appstate">appState</a>
		<a href="/_debug/async-test">Async</a>
		<a href="/_debug/canvas">Canvas</a>
		<a href="/_debug/keyboard-list-navigation">Listbox nav</a>
		<a href="/_debug/livequery-perf">Live query</a>
		<a href="/_debug/media-chrome">Player chrome</a>
		<a href="/_debug/spam-angel">Spam</a>
		<a href="/_debug/tanstack">Tanstack</a>
		<a href="/_debug/tooltips">Tooltips</a>
		<a href="/_debug/views">Views</a>
	</nav>

	<p>Different pages meant to test the application.</p>
</div>

<style>
	nav {
		margin-block: 0.5rem 1rem;
	}
</style>
