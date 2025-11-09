import {raw, sql} from '@electric-sql/pglite/template'
import {logger} from '../logger.js'
import {r4 as r4Api} from '../r4.ts'
import {getPg} from './db.js'

const log = logger.ns('channels').seal()
const LIMIT = 4000

/** Internal helper to resolve channel ID to slug */
async function channelIdToSlug(id) {
	const pg = await getPg()
	// try to get slug local
	const result = await pg.sql`select slug from channels where id = ${id}`
	if (result.rows.length) return result.rows[0].slug
	// fallback to r4 - query by ID not slug
	try {
		const {data} = await r4Api.sdk.supabase.from('channels').select('slug').eq('id', id).single().throwOnError()
		if (data?.slug) return data.slug
	} catch {
		// Continue if not found
	}
	throw new Error(`channelIdToSlug:not_found: ${id}`)
}

/** Get channels from local database */
export async function local({slug = '', limit = LIMIT} = {}) {
	const pg = await getPg()
	const whereClause = slug ? sql`where slug = ${slug}` : raw``
	return (await pg.sql`select * from channels ${whereClause} order by updated_at desc limit ${limit}`).rows
}

/** Get channels from r4 (remote) */
export async function r4({slug = '', limit = LIMIT} = {}) {
	if (slug) {
		const channel = await r4Api.channels.readChannel(slug)
		return Array.isArray(channel) ? channel : [channel]
	}
	return await r4Api.channels.readChannels(limit)
}

/** Get channels from v1 (firebase export) */
export async function v1({slug = '', limit = LIMIT} = {}) {
	try {
		const items = await readv1()
		const filtered = slug ? items.filter((item) => item.slug === slug) : items
		const channels = filtered.slice(0, limit).filter((item) => item.track_count && item.track_count > 3)
		return channels.map(parseFirebaseChannel)
	} catch (err) {
		log.error(err)
		throw err
	}
}

async function pullAll({limit = LIMIT} = {}) {
	const channels = await r4Api.channels.readChannels(limit)
	await insert(channels)
	await pullV1Channels({limit}) // must happen after r4 insert, as migrated channels exist both in v1 and r4
	return await local({limit})
}

/** Pulls either..
 * a) all channels (if no id || slug),
 * b) a single channel from local, or r4, falling back to v1 */
export async function pull({id = '', slug = '', limit = LIMIT} = {}) {
	if (id && !slug) {
		slug = await channelIdToSlug(id)
	}

	if (!slug) return await pullAll({limit})

	// Prefer local
	const localChannels = await local({slug})
	if (localChannels.length) {
		return localChannels
	}

	// Second prio is r4
	try {
		const channels = await r4({slug})
		if (channels.length) {
			await insert(channels)
			return await local({slug})
		}
	} catch {
		// This is ok, continue to v1
	}

	// Last is v1
	const v1Channels = await v1({slug})
	if (v1Channels.length) {
		await insert(v1Channels)
		return await local({slug})
	}

	// Else 404
	throw new Error(`pull_channels:channel_not_found: ${slug}`)
}

/** Insert channels into local database */
export async function insert(channels) {
	const pg = await getPg()
	await pg.transaction(async (tx) => {
		for (const channel of channels) {
			await tx.sql`
        INSERT INTO channels (id, name, slug, description, image, created_at, updated_at, latitude, longitude, url, track_count, firebase_id, source)
        VALUES (
          ${channel.id}, ${channel.name}, ${channel.slug},
          ${channel.description}, ${channel.image},
          ${channel.created_at}, ${channel.updated_at},
          ${channel.latitude}, ${channel.longitude},
          ${channel.url}, ${channel.track_count || 0}, ${channel.firebase_id || null}, ${channel.source || null}
        )
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          image = EXCLUDED.image,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          url = EXCLUDED.url,
          track_count = COALESCE(EXCLUDED.track_count, channels.track_count),
          firebase_id = COALESCE(EXCLUDED.firebase_id, channels.firebase_id),
          source = COALESCE(EXCLUDED.source, channels.source);
      `
		}
	})
	log.log('inserted channels', channels.length)
}

/** Check if a channel is outdated and needs pulling */
export async function outdated(slug) {
	const log = logger.ns(`channels.outdated(${slug})`).seal()
	const pg = await getPg()
	try {
		const channel = (await local({slug}))[0]
		const {id} = channel
		if (!id) {
			log.log('outdated because no id')
			return true
		}
		if (!channel.tracks_synced_at) {
			log.log('outdated because no tracks synced at')
			return true
		}

		// Get latest local track update
		const {rows: localRows} = await pg.sql`
      select updated_at
      from tracks
      where channel_id = ${id}
      order by updated_at desc
      limit 1
    `
		const localLatest = localRows[0]
		if (!localLatest) {
			log.log('outdated because no local tracks')
			return true
		}

		// v1 channels dont need updating because it is in read-only state since before this project
		if (channel.source === 'v1' && localLatest) {
			log.log('already up to date because v1 and has tracks already')
			return false
		}

		// Get latest remote track update
		const {data: remoteLatest} = await r4Api.sdk.supabase
			.from('channel_track')
			.select('updated_at')
			.eq('channel_id', id)
			.order('updated_at', {ascending: false})
			.limit(1)
			.single()
			.throwOnError()

		// Compare timestamps (ignoring milliseconds)
		const remoteMsRemoved = new Date(remoteLatest.updated_at || 0).setMilliseconds(0)
		const localMsRemoved = new Date(localLatest.updated_at || 0).setMilliseconds(0)
		const toleranceMs = 20 * 1000
		const isOutdated = remoteMsRemoved - localMsRemoved > toleranceMs
		if (isOutdated) {
			log.log('outdated because remote track is newer')
			return true
		}
	} catch (error) {
		log.warn('outdated because an error happened?', error)
		return true // On error, suggest update to be safe
	}
}

// Helper functions for v1 support

async function readv1() {
	const browser = typeof window !== 'undefined'
	const filename = 'channels-v1-modified.json'

	if (browser) {
		const res = await fetch(`/${filename}`)
		return await res.json()
	} else {
		// Node.js environment - use fs to read the file
		const fs = await import('node:fs')
		const path = await import('node:path')
		const filePath = path.join(process.cwd(), 'static', filename)
		const content = fs.readFileSync(filePath, 'utf8')
		return JSON.parse(content)
	}
}

function parseFirebaseChannel(item) {
	return {
		id: crypto.randomUUID(),
		firebase_id: item.firebase_id,
		slug: item.slug,
		name: item.name,
		description: item.description || '',
		image: item.image,
		track_count: item.track_count || 0,
		source: 'v1',
		created_at: new Date(item.created_at).toISOString(),
		updated_at: new Date(item.updated_at || item.created_at).toISOString()
	}
}

async function pullV1Channels({limit = 1000} = {}) {
	const pg = await getPg()
	const items = (await readv1()).slice(0, limit)
	const {rows: existingChannels} = await pg.sql`select slug, firebase_id from channels`

	const filteredItems = items.filter(
		(item) =>
			!existingChannels.some((r) => r.slug === item.slug || r.firebase_id === item.firebase_id) &&
			item.track_count &&
			item.track_count > 3
	)

	const channels = filteredItems.map(parseFirebaseChannel)
	try {
		await insert(channels)
	} catch (err) {
		log.error('pull_v1_channels_error', err)
	}
	log.log('pull_v1_channels', channels.length)
}
