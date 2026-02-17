<svelte:head>
	<title>Debug: Styles</title>
</svelte:head>

<div class="container constrained">
	<h1>Menu &amp; Nav Patterns</h1>

	<section>
		<h2><code>menu/nav</code></h2>
		<nav>
			<button>Action</button>
			<button>Action</button>
			<hr />
			<button>Action</button>
		</nav>
	</section>

	<section>
		<h2><code>.nav-grouped</code></h2>
		<nav class="nav-grouped">
			<a href="#!" aria-current="page">Tracks</a>
			<a href="#!">Tags</a>
			<a href="#!">Map</a>
			<a href="#!">About</a>
		</nav>
	</section>

	<section>
		<h2><code>.nav-vertical</code></h2>
		<menu class="nav-vertical">
			<a href="#!">Profile</a>
			<a href="#!">Account settings</a>
			<a href="#!">Sign out</a>
		</menu>
	</section>

	<section>
		<h2><code>.nav-options</code></h2>
		<menu class="nav-options">
			<a href="#!">
				<h3>Create Account</h3>
				<p>Start your radio</p>
			</a>
			<a href="#!">
				<h3>Log In</h3>
				<p>Welcome back</p>
			</a>
		</menu>
	</section>

	<section>
		<h2><code>.tabs</code></h2>
		<p><small>Scrollable tab row with underline active — links and buttons — <code>layout.css</code></small></p>
		<nav class="tabs">
			<a href="#!" class="active">Active tab</a>
			<a href="#!">Another tab</a>
			<a href="#!">Third tab</a>
			<a href="#!">Fourth tab</a>
			<a href="#!">Fifth tab that is longer</a>
		</nav>
	</section>

	<section>
		<h2><code>[popover] menu</code></h2>
		<p><small>Menu inside popover — <code>layout.css</code> lines 186–197</small></p>
		<button popovertarget="demo-popover">Open popover menu</button>
		<div id="demo-popover" popover>
			<menu>
				<button>Option A</button>
				<button>Option B</button>
			</menu>
			<menu class="nav-vertical">
				<a href="#!">Settings</a>
				<a href="#!">Help</a>
				<a href="#!">Log out</a>
			</menu>
		</div>
	</section>

	<section>
		<h2><code>.tags-menu</code></h2>
		<p><small>Scrollable vertical tag list (inside popover) — <code>[slug]/+page.svelte</code></small></p>
		<div
			style="max-width: 200px; border: 1px solid var(--gray-5); border-radius: var(--border-radius); padding: 0.5rem;"
		>
			<menu class="tags-menu">
				<button class="active">ambient (12)</button>
				<button>electronic (8)</button>
				<button>experimental (6)</button>
				<button>drone (4)</button>
				<button>field-recordings (3)</button>
				<button>noise (2)</button>
			</menu>
		</div>
	</section>

	<section>
		<h2><code>.view-modes</code></h2>
		<p>
			<small
				>Icon + label button group (inside popover) — <code>channels.svelte</code>,
				<code>channels-view.svelte</code></small
			>
		</p>
		<div
			style="max-width: 280px; border: 1px solid var(--gray-5); border-radius: var(--border-radius); padding: 0.5rem;"
		>
			<menu class="view-modes">
				<button class="active">&#x25A6;<small>Grid</small></button>
				<button>&#x2630;<small>List</small></button>
				<button>&#x1F5FA;<small>Map</small></button>
				<button>&#x221E;<small>Infinite</small></button>
			</menu>
		</div>
	</section>
</div>

<style>
	section {
		margin-block: 1.5rem;
	}

	h2 {
		margin-block-end: 0.25rem;
	}
</style>
