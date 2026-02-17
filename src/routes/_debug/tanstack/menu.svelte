<script>
	import {page} from '$app/state'
</script>

<menu class="nav-grouped">
	<a href="/_debug">&larr;</a>
	<a href="/_debug/tanstack" aria-current={page.url.pathname === '/_debug/tanstack' ? 'page' : undefined}>tanstack</a>
	<a
		href="/_debug/tanstack/error-handling"
		aria-current={page.url.pathname === '/_debug/tanstack/error-handling' ? 'page' : undefined}>errors</a
	>
	<a href="/_debug/tanstack/demo" aria-current={page.url.pathname === '/_debug/tanstack/demo' ? 'page' : undefined}
		>demo</a
	>
	<a href="/_debug/tanstack/tracks" aria-current={page.url.pathname === '/_debug/tanstack/tracks' ? 'page' : undefined}
		>tracks</a
	>
	<a
		href="/_debug/tanstack/channels"
		aria-current={page.url.pathname === '/_debug/tanstack/channels' ? 'page' : undefined}>channels</a
	>
</menu>
