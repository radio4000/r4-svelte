<script>
	import {page} from '$app/state'
</script>

<menu class="nav-grouped">
	<a
		href="/docs/tanstack"
		aria-current={page.url.pathname === '/docs/tanstack' ? 'page' : undefined}>tanstack</a
	>
	<a
		href="/docs/tanstack/error-handling"
		aria-current={page.url.pathname === '/docs/tanstack/error-handling' ? 'page' : undefined}
		>errors</a
	>
	<a
		href="/docs/tanstack/tutorial"
		aria-current={page.url.pathname === '/docs/tanstack/tutorial' ? 'page' : undefined}>tutorial</a
	>
	<a
		href="/docs/tanstack/tracks"
		aria-current={page.url.pathname === '/docs/tanstack/tracks' ? 'page' : undefined}>tracks</a
	>
	<a
		href="/docs/tanstack/channels"
		aria-current={page.url.pathname === '/docs/tanstack/channels' ? 'page' : undefined}>channels</a
	>
</menu>
