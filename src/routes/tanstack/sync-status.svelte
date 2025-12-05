<script lang="ts">
	import {getOfflineExecutor} from './collections'

	interface PendingTransaction {
		mutations?: Array<{type?: string; modified?: {title?: string}; original?: {title?: string}}>
		lastError?: {message: string}
		retryCount?: number
	}

	let isOnline = $state(navigator.onLine)
	let pendingTransactions = $state<PendingTransaction[]>([])

	$effect(() => {
		const onOnline = () => (isOnline = true)
		const onOffline = () => (isOnline = false)
		window.addEventListener('online', onOnline)
		window.addEventListener('offline', onOffline)
		return () => {
			window.removeEventListener('online', onOnline)
			window.removeEventListener('offline', onOffline)
		}
	})

	$effect(() => {
		const interval = setInterval(async () => {
			pendingTransactions = await getOfflineExecutor().peekOutbox()
		}, 1000)
		return () => clearInterval(interval)
	})

	const hasPending = $derived(pendingTransactions.length > 0)
	const showStatus = $derived(!isOnline || hasPending)
</script>

<dl class="meta">
	<dt>Sync status</dt>
	<dd>
		{#if isOnline}Online{:else}Offline{/if}
		{#if hasPending}
			<details>
				<summary>{pendingTransactions.length} pending</summary>
				<ul>
					{#each pendingTransactions as t, i (i)}
						{@const m = t.mutations?.[0]}
						<li>
							{m?.type || '?'} – {m?.modified?.title || m?.original?.title || '?'}
							{#if t.lastError}<br /><small>⚠️ {t.lastError.message} (retry {t.retryCount})</small>{/if}
						</li>
					{/each}
				</ul>
			</details>
		{:else}
			<p>No pending transactions</p>
		{/if}
	</dd>
</dl>
{#if showStatus}{/if}
