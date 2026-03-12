<script>
	import {resolve} from '$app/paths'
	import {appName} from '$lib/config'
	import * as m from '$lib/paraglide/messages'
	import {resetLocalData} from '$lib/api'

	let status = $state('idle')

	function resetDatabase() {
		status = 'resetting'
		resetLocalData()
		status = 'done'
	}

	function reload() {
		location.href = resolve('/')
	}
</script>

<article class="constrained">
	<h1>{m.recovery_title()}</h1>
	<p>{m.recovery_sorry()}</p>

	<section>
		<h2>{m.recovery_reset_db()}</h2>
		<p>{m.recovery_reset_will()}</p>
		<ul>
			<li>{m.recovery_reset_point_1()}</li>
			<li>{m.recovery_reset_point_2({appName})}</li>
			<li>{m.recovery_reset_point_3()}</li>
		</ul>
		<p><small>{m.recovery_note()}</small></p>

		<menu>
			{#if status === 'idle'}
				<button onclick={resetDatabase}>{m.recovery_reset_button()}</button>
			{:else if status === 'resetting'}
				<p>{m.recovery_resetting()}</p>
			{:else if status === 'done'}
				<p>{m.recovery_reset_success()}</p>
				<button onclick={reload}>{m.recovery_reload_app()}</button>
			{/if}
		</menu>
	</section>

	<hr />

	<menu>
		<a href={resolve('/')}>{m.recovery_go_home()}</a>
	</menu>
</article>

<style>
	article {
		margin-block: 2rem;
	}
	section {
		margin-block: 1.5rem;
	}
</style>
