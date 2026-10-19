<script>
	import Icon from '#lib/components/icon.svelte'
	import ButtonFeedback from '#lib/components/button-feedback.svelte'
	import Tag from '#lib/components/tag.svelte'
	import AutoRadioButton from '#lib/components/auto-radio-button.svelte'
</script>

<svelte:head>
	<title>Buttons — Radio4000 docs</title>
</svelte:head>

<h1>Buttons</h1>
<p>
	<small
		>Everything here comes from <code>buttons.css</code> — a global vocabulary, styled once. Inputs
		live in <a href="/docs/styles/forms">forms</a>.</small
	>
</p>

<section>
	<h2>Pick a variant</h2>
	<ul>
		<li><code>button</code> — the default. Reach for it first.</li>
		<li><code>.primary</code> — the one main action in a view.</li>
		<li><code>.danger</code> — destructive actions.</li>
		<li><code>.ghost</code> — toolbars and icon-only buttons; keeps sizing, drops the surface.</li>
		<li><code>.link</code> — reads as an inline link, behaves as a button.</li>
		<li><code>.chip</code> — toggles and filters: tags, nav pills.</li>
	</ul>

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
		</tbody>
	</table>

	<p>
		<small
			>Icon-only needs no class — a bare <code>button</code> with an <code>&lt;Icon&gt;</code> is
			square by default; add <code>.ghost</code> to drop the surface. <code>a.btn</code> makes a
			link join the family. <code>type="submit"</code> gets wider padding.
			<code>data-loading="true"</code> shows a wait cursor.</small
		>
	</p>
	<div class="row">
		<button><Icon icon="close" /></button>
		<button class="ghost"><Icon icon="settings" /></button>
		<a class="btn" href="#a">Link .btn</a>
		<button type="submit">Submit</button>
		<button data-loading="true" disabled>Loading…</button>
	</div>
</section>

<section>
	<h2>Composed patterns</h2>
	<p>
		<small>App-specific compositions built on the variants above. Each notes where it's used.</small
		>
	</p>

	<h3>Tabs (<code>.tabs</code>)</h3>
	<p><small>Section navigation on channel, track, explore and search pages.</small></p>
	<nav class="tabs">
		<button class="active">Tab 1</button>
		<button>Tab 2</button>
		<button>Tab 3</button>
	</nav>
	<div class="tabs">
		<nav>
			<a href="#a" class="active"><Icon icon="circle-info" /> Info</a>
			<a href="#b"><Icon icon="unordered-list" /> Tracks</a>
			<a href="#c"><Icon icon="hash" /> Tags</a>
			<a href="#d"><Icon icon="sparkles" /> Related</a>
		</nav>
	</div>
	<p><small>With secondary nav (<code>.track-tabs</code> pattern):</small></p>
	<div class="tabs" style="border-bottom: 1px solid var(--gray-5);">
		<nav>
			<a href="#a" class="active"><Icon icon="circle-info" /> Radio4000</a>
			<a href="#b"><Icon icon="play-fill" /> YouTube</a>
			<a href="#c"><Icon icon="code-branch" /> MusicBrainz</a>
			<a href="#d"><Icon icon="tag" /> Discogs</a>
		</nav>
		<nav style="margin-left: auto;">
			<a href="#e"><Icon icon="settings" /> Edit</a>
		</nav>
	</div>

	<h3>Chips (<code>.chip</code>)</h3>
	<p><small>Tag filters and nav pills. As buttons (toggle) or links (nav).</small></p>
	<div class="row">
		<button class="chip">jazz</button>
		<button class="chip active">dub</button>
		<a href="#a" class="btn chip">all</a>
		<a href="#b" class="btn chip active">channels</a>
	</div>
	<p>
		<small
			>With delete (<code>.chip-group</code> + <code>.chip-delete</code>) — the label is a toggle (<code
				>button.chip</code
			>) or inert (<code>span.chip</code>):</small
		>
	</p>
	<div class="row">
		<span class="chip-group">
			<button class="chip">jazz</button>
			<button class="chip-delete" aria-label="Remove jazz">×</button>
		</span>
		<span class="chip-group">
			<button class="chip active">dub</button>
			<button class="chip-delete" aria-label="Remove dub">×</button>
		</span>
		<span class="chip-group">
			<span class="chip">inert label</span>
			<button class="chip-delete" aria-label="Remove">×</button>
		</span>
	</div>

	<h3>Tags (<code>&lt;Tag&gt;</code>)</h3>
	<p>
		<small
			>Hashtag links on tracks and channels. States are auto-derived: <code>playing</code> when a
			deck plays a matching tag, <code>filtered</code> when it's in the URL <code>?tags=</code>.
			Shown here forced via props.</small
		>
	</p>
	<div class="row">
		<Tag href="#tag">#dub</Tag>
		<Tag onclick={() => {}}>clickable tag</Tag>
		<Tag href="#tag" playing>#playing</Tag>
		<Tag href="#tag" filtered>#filtered</Tag>
	</div>

	<h3>Tags menu (<code>.nav-vertical.tags-menu</code>)</h3>
	<p><small>Tag list with counts, e.g. the channel tags panel.</small></p>
	<menu class="nav-vertical tags-menu">
		<button type="button">dub (12)</button>
		<button type="button" class="active">reggae (8)</button>
		<button type="button">electronic (5)</button>
	</menu>

	<h3>Mode actions (<code>.mode-action</code>)</h3>
	<p>
		<small
			>The channel-engagement buttons in the channel header (<code>[slug]/+layout.svelte</code>):
			<b>live</b>
			(broadcast/listen), <b>auto</b>
			(auto-radio), <b>play</b> (playback). Plain buttons — the global variant and
			<code>.active</code> rules do the styling; <code>.drifted</code> tints the warning color.</small
		>
	</p>
	<table>
		<thead>
			<tr>
				<th>Mode</th>
				<th>Idle</th>
				<th>Active</th>
				<th>Drifted</th>
				<th>Disabled</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<td><code>.live</code></td>
				<td>
					<button class="mode-action live"
						><Icon icon="signal" size={14} /> <span>Live</span></button
					>
				</td>
				<td>
					<button class="mode-action live active"
						><Icon icon="signal" size={14} /> <span>Live</span></button
					>
				</td>
				<td>—</td>
				<td>
					<button class="mode-action live" disabled
						><Icon icon="signal" size={14} /> <span>Live</span></button
					>
				</td>
			</tr>
			<tr>
				<td><code>.auto</code></td>
				<td>
					<button class="mode-action auto"
						><Icon icon="infinite" size={14} /> <span>Auto</span></button
					>
				</td>
				<td>
					<button class="mode-action auto active"
						><Icon icon="infinite" size={14} /> <span>Auto</span></button
					>
				</td>
				<td>
					<button class="mode-action auto active drifted"
						><Icon icon="infinite" size={14} /> <span>Auto</span></button
					>
				</td>
				<td>
					<button class="mode-action auto" disabled
						><Icon icon="infinite" size={14} /> <span>Auto</span></button
					>
				</td>
			</tr>
			<tr>
				<td><code>.play</code></td>
				<td>
					<button class="mode-action play"
						><Icon icon="play-fill" size={14} /> <span>Play</span></button
					>
				</td>
				<td>
					<button class="mode-action play active"
						><Icon icon="pause" size={14} /> <span>Pause</span></button
					>
				</td>
				<td>—</td>
				<td>
					<button class="mode-action play" disabled
						><Icon icon="play-fill" size={14} /> <span>Play</span></button
					>
				</td>
			</tr>
		</tbody>
	</table>

	<h3>Auto radio (<code>&lt;AutoRadioButton&gt;</code> / <code>.auto-live-btn</code>)</h3>
	<p>
		<small
			>Infinite-icon button for auto-radio, used in deck headers. Idle is a plain button;
			<code>live</code> turns it active; <code>drifted</code> drops it back to a resync
			call-to-action. A <code>count</code> above 1 shows a listener badge in the corner.</small
		>
	</p>
	<div class="row">
		<AutoRadioButton title="Idle" />
		<AutoRadioButton live title="Live" />
		<AutoRadioButton live drifted title="Drifted (resync)" />
		<AutoRadioButton live count={3} title="Live with listeners" />
	</div>

	<h3>ButtonFeedback (<code>&lt;ButtonFeedback&gt;</code>)</h3>
	<p>
		<small
			>Wraps an async <code>onclick</code> and flashes the result — used for save/copy actions.</small
		>
	</p>
	<div class="row">
		<ButtonFeedback onclick={() => new Promise((r) => setTimeout(r, 600))}
			>Click me (success)</ButtonFeedback
		>
		<ButtonFeedback onclick={() => new Promise((_, r) => setTimeout(r, 600))} error="Oops">
			Click me (error)
		</ButtonFeedback>
		<ButtonFeedback class="primary" onclick={() => new Promise((r) => setTimeout(r, 600))}>
			Primary feedback
		</ButtonFeedback>
	</div>

	<h3>Badges (<code>.channel-badge</code>)</h3>
	<p><small>Live and presence indicators on channel cards and headers.</small></p>
	<div class="row">
		<span class="channel-badge">Live</span>
		<button class="channel-badge">Button badge</button>
		<button class="channel-badge drifted">Drifted</button>
		<span class="channel-badge" style:background="var(--color-red)" style:color="white">3</span>
	</div>
</section>

<section>
	<h2>Alignment checks</h2>
	<p>
		<small
			>QA rows — buttons and inputs in one row should read as one family at the same height. Watch
			surface, border and horizontal padding.</small
		>
	</p>
	<div class="row pair">
		<button>Button</button>
		<input type="text" value="Text input" />
		<select>
			<option>Select</option>
			<option>Option B</option>
		</select>
		<button class="primary">Primary</button>
	</div>
	<div class="row pair">
		<input type="search" placeholder="Search…" />
		<button><Icon icon="search" /></button>
		<button>Go</button>
	</div>
	<div class="row pair">
		<input type="text" value="With submit" />
		<button type="submit">Submit</button>
	</div>
	<div class="row pair">
		<input type="text" disabled value="Disabled field" />
		<button disabled>Disabled</button>
		<select disabled>
			<option>Disabled select</option>
		</select>
	</div>
	<p><small>Buttons scale with <code>font-size</code>:</small></p>
	<div class="row">
		<button style="font-size: var(--font-2)">Small</button>
		<button>Default</button>
		<button style="font-size: var(--font-6)">Large</button>
	</div>
</section>

<style>
	.row {
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-block: 0.5rem;
	}
	.pair {
		align-items: center;
	}
	h3 {
		margin-top: var(--space-3);
	}
</style>
