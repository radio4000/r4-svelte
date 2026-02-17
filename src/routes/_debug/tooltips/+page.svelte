<script>
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
</script>

<div class="constrained">
	<menu class="nav-grouped">
		<a href="/_debug">&larr;</a>
	</menu>
	<h1>Tooltips</h1>
	<p>Singleton tooltip using Popover API + CSS Anchor Positioning.</p>

	<section>
		<h2>Positions</h2>
		<menu>
			<button {@attach tooltip({content: 'Positioned above', position: 'top'})}> Top </button>
			<button {@attach tooltip({content: 'Positioned below', position: 'bottom'})}> Bottom </button>
			<button {@attach tooltip({content: 'Positioned left', position: 'left'})}> Left </button>
			<button {@attach tooltip({content: 'Positioned right', position: 'right'})}> Right </button>
		</menu>
	</section>

	<section>
		<h2>HTML content</h2>
		<menu>
			<button {@attach tooltip({content: '<em>Italic</em> and <strong>bold</strong>'})}> Styled </button>
			<button {@attach tooltip({content: 'Shortcut <kbd>S</kbd>'})}> With kbd </button>
		</menu>
	</section>

	<section>
		<h2>Native title (fallback)</h2>
		<p>Browser-rendered tooltips for unsupported browsers.</p>
		<menu>
			<button title="Native browser tooltip">Hover for title</button>
			<abbr title="HyperText Markup Language">HTML</abbr>
		</menu>
	</section>
</div>

<style>
	section {
		margin-block-start: 2rem;
	}
</style>
