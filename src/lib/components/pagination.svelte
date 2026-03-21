<script>
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import Dialog from './dialog.svelte'
	import * as m from '$lib/paraglide/messages'

	/** @type {{currentPage: number, pageSize: number, totalCount?: number, resultCount?: number, defaultPageSize?: number}} */
	let {currentPage, pageSize, totalCount = 0, resultCount = 0, defaultPageSize = 50} = $props()

	let showDialog = $state(false)
	let dialogInitialPage = $state(1)

	const totalPages = $derived(totalCount > 0 && pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0)
	const hasNextPage = $derived(totalPages > 0 ? currentPage < totalPages : resultCount >= pageSize)
	const hasPrevPage = $derived(currentPage > 1)

	function setPage(n) {
		const query = new URL(page.url).searchParams
		if (n <= 1) query.delete('page')
		else query.set('page', String(n))
		goto(`?${query.toString()}`, {keepFocus: true, noScroll: true})
	}

	function setPageSize(n) {
		const size = Math.max(1, Math.min(200, n || defaultPageSize))
		const query = new URL(page.url).searchParams
		if (size === defaultPageSize) query.delete('per')
		else query.set('per', String(size))
		query.delete('page')
		goto(`?${query.toString()}`, {replaceState: true, keepFocus: true})
	}
</script>

{#if hasPrevPage || hasNextPage || totalPages > 1}
	<span class="pagination">
		<button
			onclick={() => setPage(currentPage - 1)}
			disabled={!hasPrevPage}
			aria-label="Previous page">←</button
		>
		<button
			class="page-label"
			onclick={() => {
				dialogInitialPage = currentPage
				showDialog = true
			}}
			aria-label="Go to page"
			>{currentPage}{#if totalPages > 0}/{totalPages}{/if}</button
		>
		<button onclick={() => setPage(currentPage + 1)} disabled={!hasNextPage} aria-label="Next page"
			>→</button
		>
	</span>
	<Dialog bind:showModal={showDialog}>
		<div class="pagination-dialog">
			<label>
				<span>{m.channels_pagination_page()}</span>
				<input
					type="number"
					min="1"
					max={totalPages || undefined}
					value={dialogInitialPage}
					autofocus
					onchange={(e) => {
						const n = parseInt(/** @type {HTMLInputElement} */ (e.target).value)
						if (n >= 1) {
							setPage(n)
							showDialog = false
						}
					}}
				/>
			</label>
			<label>
				<span>{m.channels_pagination_per_page()}</span>
				<input
					type="number"
					min="1"
					max="200"
					value={pageSize}
					onchange={(e) => setPageSize(parseInt(/** @type {HTMLInputElement} */ (e.target).value))}
				/>
			</label>
		</div>
	</Dialog>
{/if}

<style>
	.pagination {
		display: flex;
		align-items: center;
		gap: 0.25rem;

		.page-label {
			min-width: 2.6rem;
			font-variant-numeric: tabular-nums;
			font-size: var(--font-2);
			padding: 0.1rem 0.2rem;
		}
	}

	.pagination-dialog {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.5rem 0;

		label {
			display: flex;
			align-items: center;
			gap: 0.5rem;

			span {
				min-width: 4rem;
				font-size: var(--font-3);
				color: light-dark(var(--gray-10), var(--gray-8));
			}

			input[type='number'] {
				width: 5rem;
				text-align: center;
			}
		}
	}
</style>
