const RAW_REPO_URL = __REPO_URL__ || __GIT_INFO__.remoteUrl || ''
const TRAILING_SLASH_RE = /\/$/
const DOT_GIT_RE = /\.git$/
const SCP_RE = /^git@([^:]+):(.+)$/
const SSH_RE = /^ssh:\/\/git@([^/]+)\/(.+)$/

export type RepoProvider = 'github' | 'gitlab' | 'other'

export const repoUrl = normalizeRepoUrl(RAW_REPO_URL)
export const repoProvider = detectRepoProvider(repoUrl)
export const supportsCodeSearch = repoProvider === 'github'

export function normalizeRepoUrl(url?: string | null) {
	if (!url) return ''
	const trimmed = url.trim().replace(TRAILING_SLASH_RE, '')

	const scpMatch = trimmed.match(SCP_RE)
	if (scpMatch) {
		const [, host, path] = scpMatch
		return `https://${host}/${path.replace(DOT_GIT_RE, '')}`
	}

	const sshMatch = trimmed.match(SSH_RE)
	if (sshMatch) {
		const [, host, path] = sshMatch
		return `https://${host}/${path.replace(DOT_GIT_RE, '')}`
	}

	return trimmed.replace(DOT_GIT_RE, '')
}

export function detectRepoProvider(url: string): RepoProvider {
	if (!url) return 'other'
	try {
		const hostname = new URL(url).hostname.toLowerCase()
		if (hostname === 'github.com' || hostname.endsWith('.github.com')) return 'github'
		if (hostname === 'gitlab.com' || hostname.endsWith('.gitlab.com')) return 'gitlab'
		return 'other'
	} catch {
		return 'other'
	}
}

export function repoCommitUrl(sha?: string | null) {
	if (!repoUrl || !sha) return ''
	if (repoProvider === 'gitlab') return `${repoUrl}/-/commit/${sha}`
	return `${repoUrl}/commit/${sha}`
}

export function repoBlobUrl(path: string, branch = 'main') {
	if (!repoUrl) return ''
	if (repoProvider === 'gitlab') return `${repoUrl}/-/blob/${branch}/${path}`
	return `${repoUrl}/blob/${branch}/${path}`
}

export function repoCodeSearchUrl(query: string) {
	if (!repoUrl) return ''
	if (repoProvider !== 'github') return ''
	const params = new URLSearchParams({q: query, type: 'code'})
	return `${repoUrl}/search?${params.toString()}`
}
