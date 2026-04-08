<script>
	import {resolve} from '$app/paths'
	import {appName} from '$lib/config'
	import * as m from '$lib/paraglide/messages'
	import BackLink from '$lib/components/back-link.svelte'
	import Icon from '$lib/components/icon.svelte'

	const blogPostUrl =
		'https://blog.radio4000.com/posts/use-radio4000-on-mobile-android-firefox-and-lock-the-screen/'
</script>

<svelte:head>
	<title>{m.apps_title()} — {appName}</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/menu')} />
		<h1>{m.apps_title()}</h1>
	</header>

	<p>{m.apps_install_intro({appName})}</p>

	<section>
		<h2>{m.apps_install_title()}</h2>
		<ul>
			<li>{m.apps_install_android()}</li>
			<li>{m.apps_install_android_firefox()}</li>
			<li>{m.apps_install_ios()}</li>
			<li>{m.apps_install_desktop({appName})}</li>
		</ul>
	</section>

	<section>
		<h2>{m.apps_lock_screen_title()}</h2>
		<p>{m.apps_lock_screen_intro()}</p>
	</section>

	<section>
		<h2>{m.apps_background_title()}</h2>
		<p>{m.apps_background_intro()}</p>
		<ul>
			<li>{m.apps_background_firefox_android()}</li>
			<li>{m.apps_background_brave_ios()}</li>
		</ul>
		<a href={blogPostUrl} target="_blank" rel="noreferrer">
			<Icon icon="circle-info" />
			{m.apps_blog_post()}
		</a>
	</section>
</article>

<style>
	section {
		margin-block: 1.5rem;
	}

	h2 {
		margin-block-end: 0.5rem;
	}

	ul {
		padding-left: 1.5rem;
	}

	li {
		margin-block: 0.4rem;
	}

	p {
		margin-block: 0.5rem;
	}

	a {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.75rem;
	}
</style>
