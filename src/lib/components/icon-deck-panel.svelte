<script>
	/** @type {{expanded?: boolean, size?: number}} */
	let {expanded = false, size = 18} = $props()
</script>

<svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
	<path
		fill-rule="evenodd"
		clip-rule="evenodd"
		d="M3 2H15A1 1 0 0 1 16 3V15A1 1 0 0 1 15 16H3A1 1 0 0 1 2 15V3A1 1 0 0 1 3 2ZM3 3V15H15V3H3Z"
		fill="currentColor"
	/>
	<rect x="11" y="2" width="1" height="14" fill="currentColor" />
	<rect class="panel-fill" class:expanded x="12" y="3" width="3" height="12" fill="currentColor" />
</svg>

<style>
	.panel-fill {
		opacity: 0;
		transition: opacity 180ms ease;
	}
	.panel-fill.expanded {
		opacity: 1;
	}
</style>
