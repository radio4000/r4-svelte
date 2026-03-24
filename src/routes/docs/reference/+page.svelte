<script>
	let {data} = $props()

	let allExpanded = $state(false)

	function toggleAll() {
		allExpanded = !allExpanded
	}

	const groupOrder = ['lib', 'app', 'packages', 'external', 'runtime', 'other']
	const groupLabels = {
		lib: 'lib modules',
		app: 'app modules',
		packages: 'packages',
		external: 'external docs',
		runtime: 'runtime',
		other: 'other'
	}

	const groups = $derived(groupFiles(data.overview))

	function groupFiles(overview) {
		const grouped = {}
		for (const [path, items] of Object.entries(overview)) {
			const key = groupKey(path)
			grouped[key] ??= []
			grouped[key].push({path, items})
		}

		return groupOrder
			.map((key) => ({
				key,
				label: groupLabels[key],
				files: (grouped[key] ?? []).sort((a, b) => a.path.localeCompare(b.path))
			}))
			.filter((group) => group.files.length > 0)
	}

	function groupKey(path) {
		if (path.startsWith('src/lib/')) return 'lib'
		if (path.startsWith('src/')) return 'app'
		if (path.startsWith('@')) return 'packages'
		if (path.startsWith('http')) return 'external'
		if (path.startsWith('window.')) return 'runtime'
		return 'other'
	}

	function isLink(path) {
		return path.startsWith('http')
	}
</script>

<svelte:head>
	<title>Reference - r5 docs</title>
</svelte:head>

<article>
	<header>
		<h1>Reference</h1>
		<p>
			.. of our primary modules and their functions. Generated from <code>docs/reference.json</code> which
			is created manually, well, by another robot, but still.
		</p>
		<button onclick={toggleAll}>{allExpanded ? 'Collapse all' : 'Expand all'}</button>
	</header>

	{#each groups as group (group.key)}
		<details class="group" open={allExpanded}>
			<summary><h2>{group.label}</h2></summary>
			{#each group.files as file (file.path)}
				<details open={allExpanded}>
					<summary>
						{#if isLink(file.path)}
							<a href={file.path}>{file.path}</a>
						{:else}
							<code>{file.path}</code>
						{/if}
						<small>({file.items.length})</small>
					</summary>
					<ul>
						{#each file.items as item (item.name)}
							<li>
								<span class="name">{item.name}</span>
								<span class="desc">{item.desc}</span>
							</li>
						{/each}
					</ul>
				</details>
			{/each}
		</details>
	{/each}
</article>

<style>
	header {
		margin-bottom: var(--space-3);
	}

	details.group {
		margin-block-start: var(--space-3);

		> summary h2 {
			display: inline;
			color: var(--accent-9);
		}
	}
	details:not(.group) {
		margin-inline-start: var(--space-3);

		> summary code {
			color: var(--accent-11);
		}
	}
	ul {
		padding: 0;
		list-style: none;
	}
	li {
		padding-inline-start: 1rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
	}
	.name {
		font-family: monospace;
	}
	.desc {
		font-style: italic;
	}
</style>
