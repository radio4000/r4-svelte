// Instrumented copy of @tanstack/svelte-db useLiveQuery - measurement only
// MODIFIED: Removed SvelteMap to test performance impact
import {untrack} from 'svelte'
import {BaseQueryBuilder, createLiveQueryCollection} from '@tanstack/db'
import {logger} from '$lib/logger'

const log = logger.ns('livequery').seal()

function toValue(value) {
	if (typeof value === `function`) {
		return value()
	}
	return value
}

let queryCounter = 0

export function useLiveQuery(configOrQueryOrCollection, deps = []) {
	const id = ++queryCounter
	const t0 = performance.now()
	let tCreateCollection, tSyncData

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

	let internalData = $state([])
	let status = $state('disabled')

	const syncDataFromCollection = (currentCollection) => {
		const t1 = performance.now()
		untrack(() => {
			internalData = []
			internalData.push(...[...currentCollection.values()])
		})
		tSyncData = performance.now() - t1
	}

	let currentUnsubscribe = null

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
			log.info(`#${id} ready`, {
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
				status = currentCollection.status
			},
			{includeInitialState: false}
		)

		currentUnsubscribe = subscription.unsubscribe.bind(subscription)

		if (currentCollection.status === `idle`) {
			// currentCollection.preload().catch(console.error)
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
