const AUDIO_EXT_RE = /\.(mp3|m4a|aac|mid|midi|ogg|oga|wav|flac|opus|weba|webm)(?:$|[?#/])/i
const YOUTUBE_RE = /(^|\/\/)(www\.)?(youtube\.com|youtu\.be)(\/|$)/i
const SOUNDCLOUD_RE = /(^|\/\/)(m\.)?soundcloud\.com(\/|$)/i

/** Detect direct playable audio file URLs (self-hosted, CDN, etc.). */
export function isDirectAudioUrl(url: string | null | undefined): boolean {
	if (!url) return false
	const clean = url.trim()
	if (!clean) return false
	if (AUDIO_EXT_RE.test(clean)) return true
	try {
		const pathname = decodeURIComponent(new URL(clean).pathname)
		return AUDIO_EXT_RE.test(pathname)
	} catch {
		return false
	}
}

export type PlayerProvider = 'youtube' | 'soundcloud' | 'audio' | null

/** Resolve playback provider for deck player even when DB provider is missing. */
export function inferPlayerProvider(
	provider: string | null | undefined,
	url: string | null | undefined
): PlayerProvider {
	if (provider === 'youtube' || provider === 'soundcloud' || provider === 'audio') return provider
	if (!url) return null
	if (YOUTUBE_RE.test(url)) return 'youtube'
	if (SOUNDCLOUD_RE.test(url)) return 'soundcloud'
	if (isDirectAudioUrl(url)) return 'audio'
	return null
}
