/** All localStorage keys used by R5. Add new keys here to ensure resetLocalData clears them. */
export const LOCAL_STORAGE_KEYS = {
	appState: 'r5-app-state',
	appStateQueue: 'r5-app-state-queue',
	trackMeta: 'r5-track-meta',
	playHistory: 'r5-play-history',
	spamDecisions: 'r5-spam-decisions',
	views: 'r5-views',
	pins: 'r5-pins'
} as const

/** All IndexedDB database names used by R5. */
export const IDB_DATABASES = {
	keyval: 'r5-keyval'
} as const

/** Key within the keyval database for query cache. */
export const IDB_KEYS = {
	queryCache: 'r5-query-cache'
} as const
