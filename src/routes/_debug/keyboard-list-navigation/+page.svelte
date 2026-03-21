<script>
	import {listboxNav} from '$lib/components/listbox-nav.svelte.js'

	const fruits = ['Apple', 'Banana', 'Blueberry', 'Cherry', 'Date', 'Elderberry', 'Fig', 'Grape']

	let selected = $state('')
	let active = $state('')

	/** @param {number} index @param {Element} el */
	function handleSelect(index, el) {
		selected = el.textContent ?? ''
	}

	/** @param {number} index @param {Element} el */
	function handleChange(index, el) {
		active = el.textContent ?? ''
	}
</script>

<div class="constrained">
	<menu class="nav-grouped">
		<a href="/_debug">&larr;</a>
	</menu>

	<h1>Listbox keyboard navigation</h1>

	<p>
		Implements the <a href="https://www.w3.org/WAI/ARIA/apg/patterns/listbox/"
			>ARIA Listbox pattern</a
		>
		using a Svelte attachment. Single tab stop with internal arrow key navigation.
	</p>

	<section>
		<h2>Demo</h2>

		<ul
			class="list demo-list"
			role="listbox"
			tabindex="0"
			{@attach listboxNav({onSelect: handleSelect, onChange: handleChange, wrap: true})}
		>
			{#each fruits as fruit, i (fruit)}
				<li id={`fruit-${i}`} role="option" aria-selected="false">
					{fruit}
				</li>
			{/each}
		</ul>

		<dl class="meta">
			<dt>Active</dt>
			<dd>{active || '—'}</dd>
			<dt>Selected</dt>
			<dd>{selected || '—'}</dd>
		</dl>
	</section>

	<section>
		<h2>Keyboard</h2>
		<dl class="meta">
			<dt><kbd>↑</kbd> <kbd>↓</kbd></dt>
			<dd>Navigate</dd>
			<dt><kbd>Home</kbd> <kbd>End</kbd></dt>
			<dd>Jump to start/end</dd>
			<dt><kbd>Enter</kbd> <kbd>Space</kbd></dt>
			<dd>Select item</dd>
			<dt>Type</dt>
			<dd>Jump to match</dd>
		</dl>
	</section>

	<section>
		<h2>Usage</h2>
		<pre><code
				>{`<ul
  role="listbox"
  tabindex="0"
  aria-label="Options"
  {@attach listboxNav({onSelect, onChange, wrap: true})}
>
  {#each items as item, i (item.id)}
    <li id={\`item-\${i}\`} role="option" aria-selected="false">
      {item.name}
    </li>
  {/each}
</ul>`}</code
			></pre>
	</section>

	<section>
		<h2>Options</h2>
		<dl class="meta">
			<dt>onSelect</dt>
			<dd>Callback for Enter/Space</dd>
			<dt>onChange</dt>
			<dd>Callback when active item changes</dd>
			<dt>wrap</dt>
			<dd>Wrap at list boundaries</dd>
		</dl>
	</section>
</div>

<style>
	.demo-list {
		max-width: 16rem;
		max-height: 10rem;
		overflow-y: auto;
		border: 2px dashed red;
	}

	.demo-list:focus {
		outline: 2px solid var(--accent-9);
		outline-offset: 2px;
	}

	/* aria-selected is managed by listboxNav attachment */
	.demo-list :global([aria-selected='true']) {
		background: red;
	}
</style>
