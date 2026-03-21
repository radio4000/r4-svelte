// biome-ignore-all lint/suspicious/noExplicitAny: matches @tanstack/svelte-db signature which uses `any`
/* eslint-disable @typescript-eslint/no-explicit-any */
// Instrumented copy of @tanstack/svelte-db useLiveQuery
//
// it adds measurement with performance.now()
// it fixes some bugs around svelte mutated $state during render
// it improves perf by avoiding some extra loops
import {untrack} from 'svelte'
import {BaseQueryBuilder, CollectionImpl, createLiveQueryCollection} from '@tanstack/db'
import type {
	Collection,
	Context,
	GetResult,
	InferResultType,
	InitialQueryBuilder,
	LiveQueryCollectionConfig,
	NonSingleResult,
	QueryBuilder,
	SingleResult
} from '@tanstack/db'
import type {UseLiveQueryReturn, UseLiveQueryReturnWithCollection} from '@tanstack/svelte-db'
import {logger} from '$lib/logger'

const log = logger.ns('livequery').seal()

function toValue(value: unknown) {
	if (typeof value === `function`) {
		return value()
	}
	return value
}

/** Detect a Collection instance. Uses instanceof as primary check (matches upstream React),
 *  with duck-typing fallback for multiple-package-copy edge cases. */
function isCollectionInstance(value: unknown): boolean {
	if (value instanceof CollectionImpl) return true
	return (
		value != null &&
		typeof value === `object` &&
		typeof (value as any).subscribeChanges === `function` &&
		typeof (value as any).startSyncImmediate === `function` &&
		typeof (value as any).id === `string`
	)
}

type MaybeGetter<T> = T | (() => T)

/** Collections created by useLiveQuery that should be cleaned up when replaced */
const ownedCollections = new WeakSet<object>()

// Overloads matching @tanstack/svelte-db
export function useLiveQuery<TContext extends Context>(
	queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
	deps?: Array<() => unknown>
): UseLiveQueryReturn<GetResult<TContext>, InferResultType<TContext>>
export function useLiveQuery<TContext extends Context>(
	queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext> | undefined | null,
	deps?: Array<() => unknown>
): UseLiveQueryReturn<GetResult<TContext>, InferResultType<TContext> | undefined>
export function useLiveQuery<TContext extends Context>(
	config: LiveQueryCollectionConfig<TContext>,
	deps?: Array<() => unknown>
): UseLiveQueryReturn<GetResult<TContext>, InferResultType<TContext>>
export function useLiveQuery<
	TResult extends object,
	TKey extends string | number,
	TUtils extends Record<string, any>
>(
	liveQueryCollection: MaybeGetter<Collection<TResult, TKey, TUtils> & NonSingleResult>
): UseLiveQueryReturnWithCollection<TResult, TKey, TUtils, Array<TResult>>
export function useLiveQuery<
	TResult extends object,
	TKey extends string | number,
	TUtils extends Record<string, any>
>(
	liveQueryCollection: MaybeGetter<Collection<TResult, TKey, TUtils> & SingleResult>
): UseLiveQueryReturnWithCollection<TResult, TKey, TUtils, TResult | undefined>
export function useLiveQuery(configOrQueryOrCollection: any, deps: Array<() => unknown> = []) {
	const collection = $derived.by(() => {
		let unwrappedParam = configOrQueryOrCollection
		try {
			const potentiallyUnwrapped = toValue(configOrQueryOrCollection)
			// Only accept the unwrapped value if it's a collection.
			// toValue() calls functions with no args, which is fine for getters (() => collection)
			// but query callbacks ((q) => ...) may return null or throw when q is undefined.
			// Without this guard, a callback like (q) => { if (!enabled) return null; ... }
			// would set unwrappedParam to null, bypassing the function branch entirely.
			if (
				potentiallyUnwrapped !== configOrQueryOrCollection &&
				isCollectionInstance(potentiallyUnwrapped)
			) {
				unwrappedParam = potentiallyUnwrapped
			}
		} catch {
			unwrappedParam = configOrQueryOrCollection
		}

		// Direct collection input (matches upstream React overloads 7/8)
		if (isCollectionInstance(unwrappedParam)) {
			if (unwrappedParam.status === `idle`) {
				unwrappedParam.startSyncImmediate()
			}
			return unwrappedParam
		}

		for (const dep of deps) toValue(dep)

		if (typeof unwrappedParam === `function`) {
			const queryBuilder = new BaseQueryBuilder()
			const result = unwrappedParam(queryBuilder)
			if (result === undefined || result === null) {
				return null
			}

			// Callback returned a collection (upstream overload 4)
			if (isCollectionInstance(result)) {
				if (result.status === `idle`) {
					result.startSyncImmediate()
				}
				return result
			}

			// Callback returned a QueryBuilder — wrap in live query collection
			if (result instanceof BaseQueryBuilder) {
				const lqc = createLiveQueryCollection({
					query: unwrappedParam,
					startSync: true
				})
				ownedCollections.add(lqc)
				return lqc
			}

			// Callback returned a config object
			if (typeof result === `object`) {
				const lqc = createLiveQueryCollection({
					...result,
					startSync: true
				})
				ownedCollections.add(lqc)
				return lqc
			}

			return null
		} else {
			const lqc = createLiveQueryCollection({
				...unwrappedParam,
				startSync: true
			})
			ownedCollections.add(lqc)
			return lqc
		}
	})

	let internalData: any[] = $state([])
	let status = $state('disabled')

	const syncDataFromCollection = (currentCollection) => {
		untrack(() => {
			internalData = [...currentCollection.values()]
		})
	}

	let currentUnsubscribe: (() => void) | null = null

	$effect(() => {
		const currentCollection = collection

		if (!currentCollection) {
			status = `disabled`
			untrack(() => {
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

		// Initial sync
		syncDataFromCollection(currentCollection)

		currentCollection.onFirstReady(() => {
			syncDataFromCollection(currentCollection)
			status = currentCollection.status
		})

		const subscription = currentCollection.subscribeChanges(
			() => {
				// Only sync on actual changes, not initial state
				syncDataFromCollection(currentCollection)
				// untrack: this callback can fire during $derived evaluation
				// (e.g. invalidateQueries → collection update → graph flush → emitEvents)
				// so bare $state mutations would throw state_unsafe_mutation
				untrack(() => {
					status = currentCollection.status
				})
			},
			{includeInitialState: false}
		)

		currentUnsubscribe = subscription.unsubscribe.bind(subscription)

		if (currentCollection.status === `idle`) {
			currentCollection.preload().catch(log.error)
		}

		return () => {
			if (currentUnsubscribe) {
				currentUnsubscribe()
				currentUnsubscribe = null
			}
			// Clean up live query collections we created — stops their d2ts pipeline
			// and pending onFirstReady callbacks, preventing stale re-renders.
			if (currentCollection && ownedCollections.has(currentCollection)) {
				ownedCollections.delete(currentCollection)
				currentCollection.cleanup()
			}
		}
	})

	return {
		get data() {
			const currentCollection = collection
			if (currentCollection) {
				const config = currentCollection.config
				if (config.singleResult) {
					return internalData[0]
				}
			}
			return internalData
		},
		get collection() {
			return collection
		},
		get status() {
			return status
		},
		get isLoading() {
			return status === `loading`
		},
		get isReady() {
			return status === `ready` || status === `disabled`
		},
		get isIdle() {
			return status === `idle`
		},
		get isError() {
			return status === `error`
		},
		get isCleanedUp() {
			return status === `cleaned-up`
		}
	}
}
