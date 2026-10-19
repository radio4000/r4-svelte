<script>
	import {resolve} from '$app/paths'
	import {appState} from '#lib/app-state.svelte.js'
	import {isBroadcasting as isBroadcastingDeck} from '#lib/deck.js'
	import Icon from '#lib/components/icon.svelte'
	import IconR4 from '#lib/components/icon-r4.svelte'
	import Seo from '#lib/components/seo.svelte'
	import * as m from '#lib/paraglide/messages.js'

	const userChannel = $derived(appState.channel)
	const isBroadcasting = $derived(isBroadcastingDeck(appState.decks, userChannel?.id))
</script>

<Seo title={m.broadcasts_you_are_live()} plain />

<div class="broadcast-page">
	<div class="broadcast-bar">
		<a href={resolve('/')} class="btn ghost home-btn" aria-label={m.nav_home()}>
			<IconR4 />
		</a>
		{#if userChannel}
			<a href={resolve('/[slug]', {slug: userChannel.slug})} class="channel-link">
				@{userChannel.slug}
			</a>
		{/if}
		{#if isBroadcasting}
			<span class="live-badge">
				<Icon icon="signal" />
				{m.broadcasts_you_are_live()}
			</span>
		{:else}
			<span class="idle">{m.broadcasts_none()}</span>
		{/if}
		<a href={resolve('/')} class="btn ghost exit-btn" aria-label={m.broadcast_exit_aria()}>
			<Icon icon="close" />
		</a>
	</div>
</div>

<style>
	:global {
		.layout > header {
			display: none !important;
		}

		.layout .content .scroll-area {
			flex: 0 0 auto;
			min-height: 0;
			max-height: min-content;
		}

		.layout .content .deck-strip {
			width: 100%;
			max-width: none;
			flex: 1 1 auto;

			.local {
				flex: 1 1 auto;
				min-width: 0;
			}

			.deck-item {
				flex: 1 1 0;
				min-width: 0;
			}

			.deck {
				width: 100%;
				min-width: 0;
				flex: 1 1 0;

				&.listening {
					width: 100%;
					min-width: 0;
					flex: 1 1 0;
				}
			}

			.broadcasts {
				min-width: 0;
				width: 100%;
			}
		}
	}

	.broadcast-page {
		display: flex;
		flex-direction: column;
	}

	.broadcast-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: var(--space-1) 0.5rem;
		border-bottom: 1px solid var(--color-interface-border);
		background: var(--color-interface);
		font-size: var(--font-3);
	}

	.channel-link {
		color: var(--accent-9);
		text-decoration: none;
		font-weight: 500;
		&:hover {
			text-decoration: underline;
		}
	}

	.live-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--accent-11);
		background: var(--accent-3);
		border: 1px solid
			color-mix(in oklch, var(--accent-6) calc(var(--border-opacity) * 100%), transparent);
		border-radius: var(--border-radius);
		padding: 0.1rem var(--space-2);
	}

	.idle {
		color: light-dark(var(--gray-10), var(--gray-8));
	}

	.exit-btn {
		margin-left: auto;
	}
</style>
