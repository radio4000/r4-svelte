<script>
	import {resolve} from '$app/paths'
	import {appName, appUrl} from '$lib/config'
	import * as m from '$lib/paraglide/messages'
	import BackLink from '$lib/components/back-link.svelte'
	import Seo from '$lib/components/seo.svelte'

	/** Domain without scheme — "radio4000.com" reads better than the full URL */
	const appHost = new URL(appUrl).host
</script>

<Seo title={`${m.apps_title()} — ${appName}`} plain />

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/menu')} />
		<h1>{m.apps_title()}</h1>
	</header>

	<p>{m.apps_intro({appHost})}</p>

	<ul>
		<li><strong>{m.apps_install_android_device()}</strong> — {m.apps_install_android()}</li>
		<li><strong>{m.apps_install_ios_device()}</strong> — {m.apps_install_ios()}</li>
		<li>
			<strong>{m.apps_install_desktop_device()}</strong> — {m.apps_install_desktop({appName})}
		</li>
	</ul>

	<section>
		<h2>{m.apps_playback_title()}</h2>
		<p>{m.apps_playback_intro()}</p>
		<ul>
			<li>{m.apps_background_firefox_android()}</li>
			<li>
				{m.apps_background_firefox_addons()}
				<a
					href="https://addons.mozilla.org/en-US/firefox/addon/video-background-play-fix/"
					target="_blank"
					rel="noopener">Video Background Play Fix</a
				>,
				<a href="https://github.com/gorhill/uBlock" target="_blank" rel="noopener">uBlock Origin</a>
			</li>
			<li>{m.apps_background_brave_ios()}</li>
		</ul>
	</section>
</article>

<style>
	section,
	article > ul {
		margin-block: var(--space-3);
	}
</style>
