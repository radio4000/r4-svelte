<script>
	import LiveChat from '#lib/components/live-chat.svelte'
	import Seo from '#lib/components/seo.svelte'
	import * as m from '#lib/paraglide/messages.js'
</script>

<Seo title={m.chat_panel_title()} plain />

<div class="constrained container">
	<LiveChat />
</div>
