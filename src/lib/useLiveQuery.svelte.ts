// biome-ignore-all lint/suspicious/noExplicitAny: matches @tanstack/svelte-db signature which uses `any`
/* eslint-disable @typescript-eslint/no-explicit-any */
// Instrumented copy of @tanstack/svelte-db useLiveQuery
//
// it adds measurement with performance.now()
// it fixes some bugs around svelte mutated $state during render
// it improves perf by avoiding some extra loops
import {untrack} from 'svelte'
import {BaseQueryBuilder, createLiveQueryCollection} from '@tanstack/db'
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

type MaybeGetter<T> = T | (() => T)

let queryCounter = 0

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
export function useLiveQuery<TResult extends object, TKey extends string | number, TUtils extends Record<string, any>>(
	liveQueryCollection: MaybeGetter<Collection<TResult, TKey, TUtils> & NonSingleResult>
): UseLiveQueryReturnWithCollection<TResult, TKey, TUtils, Array<TResult>>
export function useLiveQuery<TResult extends object, TKey extends string | number, TUtils extends Record<string, any>>(
	liveQueryCollection: MaybeGetter<Collection<TResult, TKey, TUtils> & SingleResult>
): UseLiveQueryReturnWithCollection<TResult, TKey, TUtils, TResult | undefined>
export function useLiveQuery(configOrQueryOrCollection: any, deps: Array<() => unknown> = []) {
	const id = ++queryCounter
	const t0 = performance.now()
	let tCreateCollection: number | undefined
	let tSyncData: number | undefined

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
			typeof unwrappedParam === `object` &&
			typeof unwrappedParam.subscribeChanges === `function` &&
			typeof unwrappedParam.startSyncImmediate === `function` &&
			typeof unwrappedParam.id === `string`

		if (isCollection) {
			if (unwrappedParam.status === `idle`) {
				unwrappedParam.startSyncImmediate()
			}
			return unwrappedParam
		}

		for (const dep of deps) toValue(dep)

		if (typeof unwrappedParam === `function`) {
			const queryBuilder = new BaseQueryBuilder()
			const result = untrack(() => unwrappedParam(queryBuilder))
			if (result === undefined || result === null) {
				return null
			}

			const t1 = performance.now()
			const lqc = createLiveQueryCollection({
				query: unwrappedParam,
				startSync: true
			})
			tCreateCollection = performance.now() - t1
			return lqc
		} else {
			const t1 = performance.now()
			const lqc = createLiveQueryCollection({
				...unwrappedParam,
				startSync: true
			})
			tCreateCollection = performance.now() - t1
			return lqc
		}
	})

	let internalData: any[] = $state([])
	let status = $state('disabled')

	const syncDataFromCollection = (currentCollection) => {
		const t1 = performance.now()
		untrack(() => {
			internalData = [...currentCollection.values()]
		})
		tSyncData = performance.now() - t1
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
		const count = untrack(() => internalData.length)

		currentCollection.onFirstReady(() => {
			status = currentCollection.status
			const total = performance.now() - t0
			log.debug(`#${id} ready`, {
				items: count,
				total: `${total.toFixed(2)}ms`,
				createCollection: `${tCreateCollection?.toFixed(2)}ms`,
				initState: 'REMOVED',
				syncData: `${tSyncData?.toFixed(2)}ms`
			})
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
