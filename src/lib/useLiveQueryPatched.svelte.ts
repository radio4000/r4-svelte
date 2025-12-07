/**
 * Patched version of @tanstack/svelte-db useLiveQuery
 * Fixes state_unsafe_mutation by deferring subscription callbacks with tick()
 * See: https://github.com/TanStack/db/issues/XXX
 *
 * MINIMAL PATCH: Only change from original is `await tick()` in subscribeChanges callback
 */
import {untrack, tick} from 'svelte'
import {SvelteMap} from 'svelte/reactivity'
import {BaseQueryBuilder, createLiveQueryCollection} from '@tanstack/db'
import type {Collection, LiveQueryCollection} from '@tanstack/db'

function toValue<T>(value: T | (() => T)): T {
	if (typeof value === 'function') {
		return (value as () => T)()
	}
	return value
}

type QueryFn = (q: BaseQueryBuilder) => unknown
type LiveQueryConfig = {query: QueryFn; [key: string]: unknown}

export function useLiveQueryPatched<T>(
	configOrQueryOrCollection:
		| QueryFn
		| LiveQueryConfig
		| Collection<T, string>
		| (() => QueryFn | LiveQueryConfig | Collection<T, string> | null),
	deps: Array<unknown | (() => unknown)> = []
) {
	const collection = $derived.by(() => {
		let unwrappedParam = configOrQueryOrCollection
		try {
			const potentiallyUnwrapped = toValue(configOrQueryOrCollection)
			if (potentiallyUnwrapped !== configOrQueryOrCollection) {
				unwrappedParam = potentiallyUnwrapped
			}
		} catch {
			unwrappedParam = configOrQueryOrCollection
		}

		const isCollection =
			unwrappedParam &&
			typeof unwrappedParam === 'object' &&
			typeof (unwrappedParam as Collection<T, string>).subscribeChanges === 'function' &&
			typeof (unwrappedParam as Collection<T, string>).startSyncImmediate === 'function' &&
			typeof (unwrappedParam as Collection<T, string>).id === 'string'

		if (isCollection) {
			const coll = unwrappedParam as LiveQueryCollection<T, string>
			if (coll.status === 'idle') {
				coll.startSyncImmediate()
			}
			return coll
		}

		deps.forEach((dep) => toValue(dep))

		if (typeof unwrappedParam === 'function') {
			const queryBuilder = new BaseQueryBuilder()
			const result = (unwrappedParam as QueryFn)(queryBuilder)
			if (result === undefined || result === null) {
				return null
			}
			return createLiveQueryCollection({
				query: unwrappedParam as QueryFn,
				startSync: true
			}) as LiveQueryCollection<T, string>
		} else {
			return createLiveQueryCollection({
				...(unwrappedParam as LiveQueryConfig),
				startSync: true
			}) as LiveQueryCollection<T, string>
		}
	})

	const state = new SvelteMap<string, T>()
	let internalData = $state<T[]>([])
	let status = $state<string>(collection ? collection.status : 'disabled')

	const syncDataFromCollection = (currentCollection: LiveQueryCollection<T, string>) => {
		untrack(() => {
			internalData = []
			internalData.push(...Array.from(currentCollection.values()))
		})
	}

	let currentUnsubscribe: (() => void) | null = null

	$effect(() => {
		const currentCollection = collection

		if (!currentCollection) {
			status = 'disabled'
			untrack(() => {
				state.clear()
				internalData = []
			})
			if (currentUnsubscribe) {
				currentUnsubscribe()
				currentUnsubscribe = null
			}
			return
		}

		status = currentCollection.status

		if (currentUnsubscribe) {
			currentUnsubscribe()
		}

		untrack(() => {
			state.clear()
			for (const [key, value] of currentCollection.entries()) {
				state.set(key, value)
			}
		})

		syncDataFromCollection(currentCollection)

		currentCollection.onFirstReady(() => {
			status = currentCollection.status
		})

		// PATCH: Added `await tick()` to defer state mutations
		const subscription = currentCollection.subscribeChanges(
			async (changes) => {
				await tick() // <-- THE FIX: defer to next microtask

				untrack(() => {
					for (const change of changes) {
						switch (change.type) {
							case 'insert':
							case 'update':
								state.set(change.key, change.value)
								break
							case 'delete':
								state.delete(change.key)
								break
						}
					}
				})

				syncDataFromCollection(currentCollection)
				status = currentCollection.status
			},
			{includeInitialState: true}
		)

		currentUnsubscribe = subscription.unsubscribe.bind(subscription)

		if (currentCollection.status === 'idle') {
			currentCollection.preload().catch(console.error)
		}

		return () => {
			if (currentUnsubscribe) {
				currentUnsubscribe()
				currentUnsubscribe = null
			}
		}
	})

	return {
		get state() {
			return state
		},
		get data() {
			return internalData
		},
		get collection() {
			return collection
		},
		get status() {
			return status
		},
		get isLoading() {
			return status === 'loading'
		},
		get isReady() {
			return status === 'ready' || status === 'disabled'
		},
		get isIdle() {
			return status === 'idle'
		},
		get isError() {
			return status === 'error'
		},
		get isCleanedUp() {
			return status === 'cleaned-up'
		}
	}
}
