<svelte:head>
	<title>Styles — Debug</title>
</svelte:head>

<div class="constrained container">
	<h1>Styles</h1>
	<p><small>Global style reference. Default element styling from <code>style.css</code>.</small></p>

	<nav class="tabs">
		<a href="/_debug/buttons">Buttons</a>
		<a href="/_debug/cards">Cards</a>
	</nav>

	<section>
		<h2>Typography</h2>
		<h1>Heading 1</h1>
		<h2>Heading 2</h2>
		<h3>Heading 3</h3>
		<h4>Heading 4</h4>
		<p>Regular paragraph text. <strong>Bold text.</strong> <em>Italic text.</em> <a href="#a">A link</a>.</p>
		<p><small>Small / secondary text</small></p>
		<p><code>Inline code</code></p>
		<pre><code
				>Preformatted code block
  with indentation</code
			></pre>
		<blockquote>A blockquote with some wisdom in it.</blockquote>
	</section>

	<section>
		<h2>Font scale</h2>
		{#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as n (n)}
			<p style="font-size: var(--font-{n})"><code>--font-{n}</code> The quick brown fox</p>
		{/each}
	</section>

	<section>
		<h2>Colors</h2>
		<h3>Gray</h3>
		<div class="swatches">
			{#each Array.from({length: 12}, (_, i) => i + 1) as n (n)}
				<div class="swatch" style="background: var(--gray-{n})">
					<small style="color: {n > 6 ? 'white' : 'black'}">{n}</small>
				</div>
			{/each}
		</div>
		<h3>Accent</h3>
		<div class="swatches">
			{#each Array.from({length: 12}, (_, i) => i + 1) as n (n)}
				<div class="swatch" style="background: var(--accent-{n})">
					<small style="color: {n > 6 ? 'white' : 'black'}">{n}</small>
				</div>
			{/each}
		</div>
	</section>

	<section>
		<h2>Lists</h2>
		<ul>
			<li>Unordered item one</li>
			<li>Unordered item two</li>
			<li>Unordered item three</li>
		</ul>
		<ol>
			<li>Ordered item one</li>
			<li>Ordered item two</li>
			<li>Ordered item three</li>
		</ol>
	</section>

	<section>
		<h2>Forms</h2>
		<form class="form" onsubmit={(e) => e.preventDefault()}>
			<fieldset>
				<label for="text-input">Text input</label>
				<input id="text-input" type="text" placeholder="Placeholder text" />
			</fieldset>
			<fieldset>
				<label for="textarea-input">Textarea</label>
				<textarea id="textarea-input" rows="3" placeholder="Write something…"></textarea>
			</fieldset>
			<fieldset>
				<label for="select-input">Select</label>
				<select id="select-input">
					<option>Option A</option>
					<option>Option B</option>
					<option>Option C</option>
				</select>
			</fieldset>
			<fieldset class="row">
				<label><input type="checkbox" /> Checkbox</label>
				<label><input type="radio" name="r" /> Radio A</label>
				<label><input type="radio" name="r" /> Radio B</label>
			</fieldset>
			<fieldset>
				<label for="range-input">Range</label>
				<input id="range-input" type="range" min="0" max="100" />
			</fieldset>
			<fieldset>
				<input type="text" disabled value="Disabled input" />
			</fieldset>
		</form>
	</section>

	<section>
		<h2>Layout classes</h2>

		<h3><code>.row</code></h3>
		<div class="row">
			<div class="box">One</div>
			<div class="box">Two</div>
			<div class="box">Three</div>
		</div>

		<h3><code>.grid</code></h3>
		<div class="grid">
			<div class="box">A</div>
			<div class="box">B</div>
			<div class="box">C</div>
			<div class="box">D</div>
		</div>

		<h3><code>.list</code></h3>
		<div class="list">
			<div class="box">Item 1</div>
			<div class="box">Item 2</div>
			<div class="box">Item 3</div>
		</div>

		<h3><code>dl.meta</code></h3>
		<dl class="meta">
			<dt>Key</dt>
			<dd>Value</dd>
			<dt>Another</dt>
			<dd>Data</dd>
			<dt>Status</dt>
			<dd>Active</dd>
		</dl>
	</section>

	<section>
		<h2>Table</h2>
		<table>
			<thead>
				<tr>
					<th>Name</th>
					<th>Type</th>
					<th>Count</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td>Alpha</td>
					<td>Primary</td>
					<td>42</td>
				</tr>
				<tr>
					<td>Beta</td>
					<td>Secondary</td>
					<td>17</td>
				</tr>
				<tr>
					<td>Gamma</td>
					<td>Tertiary</td>
					<td>8</td>
				</tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Misc</h2>
		<hr />
		<details>
			<summary>Details / disclosure</summary>
			<p>Hidden content revealed on click.</p>
		</details>
		<p><kbd>Ctrl</kbd> + <kbd>K</kbd> — keyboard shortcut styling</p>
		<p><mark>Highlighted text</mark></p>
	</section>
</div>

<style>
	section {
		margin-block: 2rem;
	}
	.swatches {
		display: flex;
		gap: 2px;
		margin-block: 0.5rem;
	}
	.swatch {
		flex: 1;
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		border-radius: 4px;
		min-width: 2rem;
	}
	.box {
		padding: 0.75rem 1rem;
		background: var(--gray-3);
		border-radius: var(--border-radius);
	}
</style>
