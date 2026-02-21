// Re-export all collections and their associated functions

// Shared utilities
export {queryClient} from './collections/query-client'
export {getErrorMessage} from './collections/utils'

// Local-only collections (localStorage)
export {trackMetaCollection, deleteTrackMeta, type TrackMeta} from './collections/track-meta'
export {
	playHistoryCollection,
	addPlayHistoryEntry,
	endPlayHistoryEntry,
	clearPlayHistory,
	type PlayHistoryEntry
} from './collections/play-history'
export {spamDecisionsCollection, type SpamDecision} from './collections/spam-decisions'
export {
	viewsCollection,
	createView,
	updateView,
	deleteView,
	pinView,
	unpinView,
	reorderPinnedViews,
	type SavedView
} from './collections/views'

// Synced collections
export {followsCollection, followChannel, unfollowChannel, loadUserFollows} from './collections/follows'
export {channelsCollection, createChannel, updateChannel, deleteChannel, type Channel} from './collections/channels'
export {broadcastsCollection, readBroadcasts, readBroadcast} from './collections/broadcasts'
export {
	tracksCollection,
	getTrackWithMeta,
	addTrack,
	updateTrack,
	deleteTrack,
	batchUpdateTracksUniform,
	batchUpdateTracksIndividual,
	batchDeleteTracks,
	checkTracksFreshness,
	ensureTracksLoaded,
	insertDurationFromMeta
} from './collections/tracks'
