<script>
	/** @type {{tag: string, count: number, pct: number, href: string}} */
	const {tag, count, pct, href} = $props()
</script>

<a class="row tag-row" {href}>
	<span class="tag-value">#{tag}</span>
	<span class="count">{count}</span>
	<span class="bar" style="--pct: {pct}%"></span>
</a>

<style>
	.tag-row {
		text-decoration: none;
		color: inherit;
		width: 100%;
		flex-wrap: nowrap;
		align-items: center;
	}

	.tag-value {
		flex: 0 1 auto;
		max-width: 24ch;
		min-width: 2ch;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--accent-9);
	}

	.count {
		flex: 0 0 auto;
		font-variant-numeric: tabular-nums;
		font-size: var(--font-2);
		color: light-dark(var(--gray-9), var(--gray-8));
	}

	.bar {
		flex: 1;
		min-width: 2rem;
		height: 4px;
		background: linear-gradient(to left, var(--accent-9) var(--pct), var(--gray-6) var(--pct));
		border-radius: 1px;
		align-self: center;
		transition: height 100ms ease;
	}

	.tag-row:hover .bar {
		height: 0.75rem;
	}
</style>
