<script>
	import {resolve} from '$app/paths'
	import {appShortName} from '$lib/config'
	import * as m from '$lib/paraglide/messages'

	let {relatedTracks = []} = $props()
</script>

{#if relatedTracks.length > 0}
	<p>{m.track_related_heading()}</p>
	<dl>
		{#each relatedTracks as related (related.id)}
			<dt>
				<a href={resolve('/[slug]/tracks/[tid]', {slug: related.slug, tid: related.id})}>
					{related.title}
				</a>
			</dt>
			<dd>
				{m.track_related_by()}
				<a href={resolve('/[slug]', {slug: related.slug})}>@{related.slug}</a>
			</dd>
		{/each}
	</dl>
{:else}
	<p>{m.track_related_empty({appShortName})}</p>
{/if}

<style>
	a {
		color: var(--accent-9);
	}
</style>
