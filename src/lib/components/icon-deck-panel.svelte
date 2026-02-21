<script>
	/** @type {{expanded?: boolean, size?: number}} */
	let {expanded = false, size = 20} = $props()
</script>

<i class="icon"
	><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
		<!-- Frame with hollow center -->
		<path
			fill-rule="evenodd"
			clip-rule="evenodd"
			d="M5 3C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3H5ZM5 5H19V19H5V5Z"
			fill="currentColor"
		/>
		<!-- Divider -->
		<rect x="14" y="3" width="2" height="18" fill="currentColor" />
		<!-- Right panel fill (smaller side) -->
		<rect class="panel-fill" class:expanded x="16" y="5" width="3" height="14" fill="currentColor" />
	</svg></i
>

<style>
	.icon {
		display: flex;
		align-items: center;
		font-style: normal;
	}
	.panel-fill {
		opacity: 0;
		transition: opacity 180ms ease;
	}
	.panel-fill.expanded {
		opacity: 1;
	}
</style>
