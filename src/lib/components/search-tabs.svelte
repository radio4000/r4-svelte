<script>
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import * as m from '$lib/paraglide/messages'

	const q = $derived(page.url.searchParams.get('q') ?? '')
	function href(path) {
		return q ? `${resolve(path)}?q=${encodeURIComponent(q)}` : resolve(path)
	}

	const value = $derived(page.route.id ?? '/search')

	function onchange(e) {
		goto(href(e.currentTarget.value))
	}
</script>

<select class="search-tabs btn" {onchange} {value}>
	<option value="/search">{m.search_tab_all()}</option>
	<option value="/search/channels">{m.search_tab_channels()}</option>
	<option value="/search/tracks">{m.search_tab_tracks()}</option>
</select>
