// biome-ignore-all lint/suspicious/noExplicitAny: matches @tanstack/svelte-db signature which uses `any`
/* eslint-disable @typescript-eslint/no-explicit-any */
// Copy of @tanstack/svelte-db useLiveQuery (1.0.0-rc.1.1), kept close to upstream so it diffs cleanly.
// Our changes:
//
// - rows live in one $state.raw snapshot instead of deep $state + a SvelteMap patched per change.
//   Deep state re-proxies every row on each sync, so one delete in a 2.6k-track channel hands
//   every TrackCard a "new" track and re-renders them all. `state` is read lazily off the snapshot.
// - every write in the observer callback is untracked. The callback can fire during $derived
//   evaluation (invalidateQueries → collection update → graph flush → emit), where a bare $state
//   write throws state_unsafe_mutation. Upstream only untracks the row writes, not `status`.
// - the subscribing $effect tracks only `resolved` (see the comment there).
// - the initial snapshot ignores DbProvider `hydrating`: upstream reads it via `useDbContext`,
//   which svelte-db doesn't export. We use no DbProvider, so the server snapshot is SSR-only.
// - `livequery:*` perf spans (#lib/perf.js)
import {untrack} from 'svelte'
import {
	UnhashableQueryIRError,
	createLiveQueryObserver,
	createLiveQuerySourceIdClaims,
	getLiveQueryHash,
	getPublicCollection,
	getStableValueHash,
	identifyLiveQuery,
	isCollection,
	isSingleResultCollection,
	prepareLiveQueryValue,
	rejectLiveQueryInput,
	releaseDeferredOnReclaim,
	resolveLiveQueryValue,
	resumeDeferredLiveQueryCollections
} from '@tanstack/db'
import type {
	Collection,
	Context,
	GetResult,
	InferResultType,
	InitialQueryBuilder,
	NonSingleResult,
	QueryBuilder,
	SingleResult
} from '@tanstack/db'
import {useOptionalDbClient} from '@tanstack/svelte-db'
import type {
	ConditionalUseLiveQueryReturn,
	UseLiveQueryConfig,
	UseLiveQueryReturn,
	UseLiveQueryReturnWithCollection
} from '@tanstack/svelte-db'
import {span} from '#lib/perf.js'

const DEFAULT_GC_TIME_MS = 1
const EMPTY_ROWS: readonly any[] = Object.freeze([])
const EMPTY_STATE: ReadonlyMap<any, any> = new Map()

function toValue(value: unknown) {
	if (typeof value === `function`) {
		return value()
	}
	return value
}

type MaybeGetter<T> = T | (() => T)

type InferConditionalResultType<TContext extends Context> = TContext extends SingleResult
	? InferResultType<TContext> | []
	: InferResultType<TContext>

// Overloads matching @tanstack/svelte-db
export function useLiveQuery<TContext extends Context>(
	queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
	deps?: Array<() => unknown>
): UseLiveQueryReturn<GetResult<TContext>, InferResultType<TContext>>
export function useLiveQuery<TContext extends Context>(
	queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext> | undefined | null,
	deps?: Array<() => unknown>
): ConditionalUseLiveQueryReturn<GetResult<TContext>, InferConditionalResultType<TContext>>
export function useLiveQuery<TContext extends Context>(
	config: UseLiveQueryConfig<TContext>,
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
	const contextDbClient = useOptionalDbClient()
	// Source Collection IDs this hook's client-backed queries read, kept until it unmounts.
	const sourceIdClaims = createLiveQuerySourceIdClaims()

	const resolved = $derived.by(() => {
		// First check if the original parameter might be a getter
		// by seeing if toValue returns something different than the original
		let unwrappedParam = configOrQueryOrCollection
		try {
			const potentiallyUnwrapped = toValue(configOrQueryOrCollection)
			if (potentiallyUnwrapped !== configOrQueryOrCollection) {
				unwrappedParam = potentiallyUnwrapped
			}
		} catch {
			// If toValue fails, use original parameter
			unwrappedParam = configOrQueryOrCollection
		}

		const inputIsCollection = isCollection(unwrappedParam)
		const dbClient = inputIsCollection
			? contextDbClient
			: (unwrappedParam?.client ?? contextDbClient)

		if (inputIsCollection) {
			// In on-demand mode, data only loads when a query with predicates asks for it
			if (unwrappedParam.config?.syncMode === `on-demand`) {
				console.warn(
					`[useLiveQuery] Passing a collection with syncMode "on-demand" directly will not load any data. ` +
						`Use a query builder function instead.`
				)
			}
			if (unwrappedParam.status === `idle`) {
				unwrappedParam.startSyncImmediate()
			}
			return {
				collection: unwrappedParam,
				client: dbClient,
				queryHash: getStableValueHash([`collection`, unwrappedParam.id], `queryKey`),
				resumeDeferredCollections: () => {}
			}
		}

		// Reference deps to make computed reactive to them
		const dependencyValues = deps.map((dep) => toValue(dep))
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, not reactive
		const deferredCollections = new Set<any>()
		// A query rejected anywhere after preparation releases the sync starts it deferred.
		try {
			const preparedValue = prepareLiveQueryValue(unwrappedParam, dbClient, deferredCollections)
			const configuredQueryKey = unwrappedParam?.queryKey
			const queryKey = configuredQueryKey ? toValue(configuredQueryKey) : undefined
			// A client-backed query without queryKey needs a stable IR identity.
			const derivedHash =
				dbClient && !queryKey?.length
					? identifyLiveQuery(
							preparedValue,
							{claims: sourceIdClaims, client: dbClient, bindingName: `useLiveQuery`},
							getLiveQueryHash
						)
					: undefined
			let queryHash: string | undefined
			try {
				queryHash =
					deps.length > 0 && !queryKey?.length
						? getStableValueHash(
								[`deps`, dependencyValues, derivedHash ?? getLiveQueryHash(preparedValue)],
								`queryKey`
							)
						: (derivedHash ?? getLiveQueryHash(preparedValue, queryKey))
			} catch (error) {
				if (!(error instanceof UnhashableQueryIRError)) throw error
				if (queryKey?.length) throw error
			}

			let collection: any
			if (preparedValue === undefined || preparedValue === null) {
				collection = null
			} else if (isCollection(preparedValue)) {
				collection = preparedValue
			} else {
				// Hydration keys the live-query Collection by identity, so it never pools.
				collection = resolveLiveQueryValue(preparedValue, {
					gcTime: DEFAULT_GC_TIME_MS,
					pool: dbClient ? false : undefined
				})
			}

			// A setup that never subscribes releases its deferred sync starts when GC reclaims it.
			const cancelReclaimRelease =
				collection && !isCollection(preparedValue)
					? releaseDeferredOnReclaim(collection, deferredCollections)
					: undefined

			return {
				collection,
				client: dbClient,
				queryHash,
				resumeDeferredCollections: () => {
					cancelReclaimRelease?.()
					resumeDeferredLiveQueryCollections(deferredCollections)
				}
			}
		} catch (error) {
			return rejectLiveQueryInput(deferredCollections, error)
		}
	})

	let endReady: ReturnType<typeof span> | null = null

	const observe = (next: typeof resolved) => {
		const id = next.collection?.id
		endReady = id ? span('livequery:ready', {id}) : null
		return createLiveQueryObserver(next.collection, {
			client: next.client,
			queryHash: next.queryHash,
			onPreload: next.resumeDeferredCollections
		})
	}

	let currentResolved = untrack(() => resolved)
	let currentObserver = observe(currentResolved)

	// One immutable snapshot per change: data, state, status, flags and health together.
	let snapshot = $state.raw(
		typeof window === `undefined`
			? currentObserver.getServerSnapshot()
			: currentObserver.getSnapshot()
	)

	const syncFromObserver = (observer: typeof currentObserver) => {
		const end = span('livequery:copy')
		const next = observer.getSnapshot()
		untrack(() => {
			snapshot = next
		})
		const rows = Array.isArray(next.data) ? next.data.length : next.data === undefined ? 0 : 1
		end({id: next.collection?.id, rows})
		if (endReady && next.status === `ready`) {
			endReady({rows})
			endReady = null
		}
	}

	// Watch for collection changes and subscribe to updates
	$effect(() => {
		const nextResolved = resolved
		// Only `resolved` may rerun this effect. Resuming deferred collections can start a sync
		// that reads app state; tracking it reran the effect with the same query, the cleanup had
		// disposed the observer, and subscribing to it threw (TanStack DB error 12).
		return untrack(() => subscribeTo(nextResolved))
	})

	function subscribeTo(nextResolved: typeof resolved) {
		if (nextResolved !== currentResolved) {
			currentObserver.dispose()
			currentResolved = nextResolved
			currentObserver = observe(nextResolved)
			syncFromObserver(currentObserver)
		}

		const observer = currentObserver
		const unsubscribe = observer.subscribe(() => {
			syncFromObserver(observer)
		})

		try {
			currentResolved.resumeDeferredCollections()
			syncFromObserver(observer)
		} catch (error) {
			unsubscribe()
			observer.dispose()
			throw error
		}

		// Cleanup when effect is invalidated
		return () => {
			unsubscribe()
			if (observer === currentObserver) observer.dispose()
		}
	}

	// Every read goes through the compiled query, so a query the hook rejected
	// throws on each read instead of serving the previous query's state.
	const read = () => {
		void resolved
		return snapshot
	}

	return {
		get state() {
			return read().state ?? EMPTY_STATE
		},
		get data() {
			const currentCollection = resolved.collection
			if (currentCollection && isSingleResultCollection(currentCollection)) {
				return snapshot.data
			}
			return snapshot.data ?? EMPTY_ROWS
		},
		get collection() {
			return getPublicCollection(resolved.collection)
		},
		get status() {
			return read().status
		},
		get isLoading() {
			return read().isLoading
		},
		get isReady() {
			return read().isReady
		},
		get isIdle() {
			return read().isIdle
		},
		get isLoadingError() {
			return read().isLoadingError
		},
		get isCrashed() {
			return read().isCrashed
		},
		get isCleanedUp() {
			return read().isCleanedUp
		},
		get isSyncError() {
			return read().isSyncError
		},
		get health() {
			return read().health
		}
	}
}
