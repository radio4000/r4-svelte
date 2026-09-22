<script>
	import {goto} from '$app/navigation'
	import {page} from '$app/state'
	import Dialog from './dialog.svelte'
	import * as m from '$lib/paraglide/messages'

	/** Local navigation uses onPageChange instead of URLs and omits the page-size dialog.
	 * @type {{currentPage: number, pageSize: number, totalCount?: number, resultCount?: number, defaultPageSize?: number, onPageChange?: (page: number) => void}}
	 */
	let {
		currentPage,
		pageSize,
		totalCount = 0,
		resultCount = 0,
		defaultPageSize = 50,
		onPageChange
	} = $props()

	let showDialog = $state(false)
	let dialogInitialPage = $state(1)

	const totalPages = $derived(totalCount > 0 && pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0)
	const hasNextPage = $derived(
		totalPages > 0 ? currentPage < totalPages : !onPageChange && resultCount >= pageSize
	)
	const hasPrevPage = $derived(currentPage > 1)

	/** Real href for page `n`, so prev/next are crawlable links you can open in a new tab. */
	function pageHref(n) {
		const query = new URL(page.url).searchParams
		if (n <= 1) query.delete('page')
		else query.set('page', String(n))
		const q = query.toString()
		return `${page.url.pathname}${q ? `?${q}` : ''}`
	}

	function setPage(n) {
		goto(pageHref(n), {keepFocus: true, noScroll: true})
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

{#if onPageChange || hasPrevPage || hasNextPage || totalPages > 1}
	<span class="pagination">
		{#if onPageChange}
			<button
				type="button"
				disabled={!hasPrevPage}
				onclick={() => onPageChange(currentPage - 1)}
				aria-label={m.pagination_previous_page()}>←</button
			>
		{:else if hasPrevPage}
			<a
				class="btn"
				rel="prev"
				href={pageHref(currentPage - 1)}
				data-sveltekit-noscroll
				data-sveltekit-keepfocus
				aria-label={m.pagination_previous_page()}>←</a
			>
		{:else}
			<span class="btn" aria-disabled="true" aria-label={m.pagination_previous_page()}>←</span>
		{/if}
		{#if onPageChange}
			<span class="page-label" aria-live="polite">{currentPage}/{totalPages}</span>
		{:else}
			<button
				class="page-label"
				onclick={() => {
					dialogInitialPage = currentPage
					showDialog = true
				}}
				aria-label={m.pagination_go_to_page()}
				>{currentPage}{#if totalPages > 0}/{totalPages}{/if}</button
			>
		{/if}
		{#if onPageChange}
			<button
				type="button"
				disabled={!hasNextPage}
				onclick={() => onPageChange(currentPage + 1)}
				aria-label={m.pagination_next_page()}>→</button
			>
		{:else if hasNextPage}
			<a
				class="btn"
				rel="next"
				href={pageHref(currentPage + 1)}
				data-sveltekit-noscroll
				data-sveltekit-keepfocus
				aria-label={m.pagination_next_page()}>→</a
			>
		{:else}
			<span class="btn" aria-disabled="true" aria-label={m.pagination_next_page()}>→</span>
		{/if}
	</span>
	{#if !onPageChange}
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
						onchange={(e) =>
							setPageSize(parseInt(/** @type {HTMLInputElement} */ (e.target).value))}
					/>
				</label>
			</div>
		</Dialog>
	{/if}
{/if}

<style>
	.pagination {
		display: flex;
		align-items: center;
		gap: var(--space-1);

		/* Anchors can't be `:disabled`, so match what buttons.css does for them. */
		[aria-disabled='true'] {
			color: var(--gray-8);
			cursor: default;

			&:hover {
				background: var(--button-bg);
				border-color: transparent;
			}
		}

		/* Reserve the counter width so Next stays put when the current page gains a digit. */
		span.page-label {
			min-width: 7ch;
			text-align: center;
		}

		.page-label {
			min-width: 2.6rem;
			font-variant-numeric: tabular-nums;
			font-size: var(--font-2);
			padding: 0.1rem var(--space-1);
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
