<script>
	import Icon from '$lib/components/icon.svelte'
	import ButtonFeedback from '$lib/components/button-feedback.svelte'

	let active = $state(false)
</script>

<svelte:head>
	<title>Buttons — Debug</title>
</svelte:head>

<div class="constrained container">
	<h1>Buttons</h1>
	<p><small>All button variants from <code>buttons.css</code></small></p>

	<section>
		<h2>Base</h2>
		<div class="row">
			<button>Default</button>
			<button disabled>Disabled</button>
			<a class="btn" href="#a">Link .btn</a>
			<button type="submit">Submit</button>
		</div>
	</section>

	<section>
		<h2>Variants</h2>
		<div class="row">
			<button class="primary">Primary</button>
			<button class="danger">Danger</button>
			<button class="ghost">Ghost</button>
			<button class="link">Link</button>
			<button class="chip">Chip</button>
		</div>
	</section>

	<section>
		<h2>Active state</h2>
		<div class="row">
			<button class="active">Default active</button>
			<button class="primary active">Primary active</button>
			<button class="chip active">Chip active</button>
		</div>
		<div class="row">
			<button class:active onclick={() => (active = !active)}>
				Toggle ({active ? 'on' : 'off'})
			</button>
		</div>
	</section>

	<section>
		<h2>With icons</h2>
		<div class="row">
			<button><Icon icon="add" /> Add</button>
			<button class="primary"><Icon icon="play-fill" /> Play</button>
			<button class="danger"><Icon icon="delete" /> Delete</button>
			<button class="ghost"><Icon icon="settings" /></button>
			<button class="chip"><Icon icon="tag" /> Tag</button>
		</div>
	</section>

	<section>
		<h2>Icon button</h2>
		<div class="row">
			<button class="icon-btn"><Icon icon="close" /></button>
			<button class="icon-btn"><Icon icon="search" /></button>
			<button class="icon-btn"><Icon icon="settings" /></button>
			<button class="icon-btn"><Icon icon="options-horizontal" /></button>
			<button class="icon-btn" disabled><Icon icon="delete" /></button>
		</div>
	</section>

	<section>
		<h2>Loading</h2>
		<div class="row">
			<button data-loading="true" disabled>Loading…</button>
		</div>
	</section>

	<section>
		<h2>ButtonFeedback</h2>
		<div class="row">
			<ButtonFeedback onclick={() => new Promise((r) => setTimeout(r, 600))}>Click me (success)</ButtonFeedback>
			<ButtonFeedback onclick={() => new Promise((_, r) => setTimeout(r, 600))} error="Oops">
				Click me (error)
			</ButtonFeedback>
			<ButtonFeedback class="primary" onclick={() => new Promise((r) => setTimeout(r, 600))}>
				Primary feedback
			</ButtonFeedback>
		</div>
	</section>

	<section>
		<h2>Tabs (.tabs)</h2>
		<nav class="tabs">
			<button class="active">Tab 1</button>
			<button>Tab 2</button>
			<button>Tab 3</button>
		</nav>
	</section>

	<section>
		<h2>Sizes comparison</h2>
		<div class="row">
			<button style="font-size: var(--font-2)">Small</button>
			<button>Default</button>
			<button style="font-size: var(--font-6)">Large</button>
		</div>
	</section>

	<section>
		<h2>All variants side-by-side</h2>
		<table>
			<thead>
				<tr>
					<th>Variant</th>
					<th>Default</th>
					<th>Hover/focus</th>
					<th>Active</th>
					<th>Disabled</th>
					<th>With icon</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td><code>button</code></td>
					<td><button>Label</button></td>
					<td><small>hover me →</small></td>
					<td><button class="active">Label</button></td>
					<td><button disabled>Label</button></td>
					<td><button><Icon icon="add" /> Label</button></td>
				</tr>
				<tr>
					<td><code>.primary</code></td>
					<td><button class="primary">Label</button></td>
					<td><small>hover me →</small></td>
					<td><button class="primary active">Label</button></td>
					<td><button class="primary" disabled>Label</button></td>
					<td><button class="primary"><Icon icon="play-fill" /> Label</button></td>
				</tr>
				<tr>
					<td><code>.danger</code></td>
					<td><button class="danger">Label</button></td>
					<td><small>hover me →</small></td>
					<td><button class="danger active">Label</button></td>
					<td><button class="danger" disabled>Label</button></td>
					<td><button class="danger"><Icon icon="delete" /> Label</button></td>
				</tr>
				<tr>
					<td><code>.ghost</code></td>
					<td><button class="ghost">Label</button></td>
					<td><small>hover me →</small></td>
					<td><button class="ghost active">Label</button></td>
					<td><button class="ghost" disabled>Label</button></td>
					<td><button class="ghost"><Icon icon="settings" /> Label</button></td>
				</tr>
				<tr>
					<td><code>.link</code></td>
					<td><button class="link">Label</button></td>
					<td><small>hover me →</small></td>
					<td>—</td>
					<td><button class="link" disabled>Label</button></td>
					<td>—</td>
				</tr>
				<tr>
					<td><code>.chip</code></td>
					<td><button class="chip">Label</button></td>
					<td><small>hover me →</small></td>
					<td><button class="chip active">Label</button></td>
					<td><button class="chip" disabled>Label</button></td>
					<td><button class="chip"><Icon icon="tag" /> Label</button></td>
				</tr>
				<tr>
					<td><code>.icon-btn</code></td>
					<td><button class="icon-btn"><Icon icon="search" /></button></td>
					<td><small>hover me →</small></td>
					<td>—</td>
					<td><button class="icon-btn" disabled><Icon icon="search" /></button></td>
					<td>—</td>
				</tr>
			</tbody>
		</table>
	</section>
</div>

<style>
	section {
		margin-block: 2rem;
	}
	.row {
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-block: 0.5rem;
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	th,
	td {
		padding: 0.75rem 0.5rem;
		text-align: left;
		border-bottom: 1px solid var(--gray-4);
		vertical-align: middle;
	}
	th {
		font-size: var(--font-3);
		color: var(--gray-9);
	}
</style>
