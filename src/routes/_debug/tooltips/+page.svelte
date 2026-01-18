<script>
	import ToolTip from '$lib/components/tool-tip.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.js'
</script>

<div class="constrained">
	<menu data-grouped>
		<a href="/_debug">&larr;</a>
	</menu>
	<h1>Tooltips</h1>
	<p>Testing tooltip components and attachments.</p>

	<section>
		<h2>Inline component</h2>
		<menu>
			<button id="save-btn" type="button">Save</button>
		</menu>
		<ToolTip targetId="save-btn" content="Save your changes" />

		<p>Positioned tooltips:</p>
		<menu>
			<button id="top-btn" type="button">Top</button>
			<button id="right-btn" type="button">Right</button>
			<button id="bottom-btn" type="button">Bottom</button>
			<button id="left-btn" type="button">Left</button>
		</menu>

		<ToolTip targetId="top-btn" content="Positioned above" position="top" />
		<ToolTip targetId="right-btn" content="Positioned right" position="right" />
		<ToolTip targetId="bottom-btn" content="Positioned below" position="bottom" />
		<ToolTip targetId="left-btn" content="Positioned left" position="left" />
	</section>

	<section>
		<h2>Attachments</h2>
		<menu>
			<button {@attach tooltip({content: 'Via attachment', position: 'bottom'})}> Hover me </button>
			<button {@attach tooltip({content: '<em>HTML</em> content', position: 'bottom'})}> HTML </button>
			<button {@attach tooltip({content: 'Positioned above', position: 'top'})}> Top </button>
			<button {@attach tooltip({content: 'Positioned below', position: 'bottom'})}> Bottom </button>
			<button {@attach tooltip({content: 'Positioned left', position: 'left'})}> Left </button>
			<button {@attach tooltip({content: 'Positioned right', position: 'right'})}> Right </button>
		</menu>
	</section>
</div>

<style>
	section {
		margin-block-start: 2rem;
	}
</style>
