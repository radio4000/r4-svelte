export const DEFAULTS = {
	AVG_TRACKS_PER_CHANNEL: 200,
	AVG_UNIQUE_ARTIST_RATIO: 0.6,
	FALLBACK_CHANNEL_COUNT: 5000
} as const

export type Algorithm = 'equal_per_track' | 'equal_per_artist' | 'track_weighted'

export interface EconomyParams {
	payingUsers: number
	avgContribution: number
	platformCutPct: number
	curatorAllocationPct: number
	artistReachabilityPct: number
	algorithm: Algorithm
	channelCount: number
	avgTracksPerChannel: number
	uniqueArtistRatio: number
	monthlyGrowthRatePct: number
}

export interface BreakevenResult {
	usersFor1EuroPerArtist: number
	usersFor10EuroPerArtist: number
	usersFor1PlatformSalary: number
}

export interface Projection {
	label: string
	months: number
	totalPool: number
	totalArtistPool: number
	avgMonthlyPerArtist: number
}

export interface Scenario {
	label: string
	channels: number
	avgContrib: number
	grossPool: number
	netArtistPool: number
}

export interface EconomyResult {
	grossPool: number
	platformShare: number
	netPool: number
	curatorPool: number
	artistPool: number
	reachableArtistPool: number
	pendingArtistPool: number
	totalTracks: number
	totalArtists: number
	perTrack: number
	perArtist: number
	perTrackWeighted: {low: number; average: number; high: number}
	breakeven: BreakevenResult
	projections: Projection[]
	scenarios: Scenario[]
	retention: number
}

export interface ChannelResult {
	trackShare: number
	estimatedArtists: number
	monthlyArtistEarnings: number
	monthlyCuratorEarnings: number
	projections: Array<{label: string; months: number; earnings: number}>
}

export function computeEconomy(p: EconomyParams): EconomyResult {
	const grossPool = p.payingUsers * p.avgContribution
	const platformShare = grossPool * (p.platformCutPct / 100)
	const netPool = grossPool - platformShare
	const curatorPool = netPool * (p.curatorAllocationPct / 100)
	const artistPool = netPool - curatorPool
	const reachableArtistPool = artistPool * (p.artistReachabilityPct / 100)
	const pendingArtistPool = artistPool - reachableArtistPool

	const totalTracks = p.channelCount * p.avgTracksPerChannel
	const totalArtists = Math.round(totalTracks * p.uniqueArtistRatio)

	const perTrack = totalTracks > 0 ? reachableArtistPool / totalTracks : 0
	const perArtist = totalArtists > 0 ? reachableArtistPool / totalArtists : 0
	const perTrackWeighted = {low: perTrack * 0.5, average: perTrack, high: perTrack * 1.5}

	const retention = (1 - p.platformCutPct / 100) * (1 - p.curatorAllocationPct / 100)

	const breakeven: BreakevenResult =
		totalArtists === 0 || retention === 0
			? {
					usersFor1EuroPerArtist: Infinity,
					usersFor10EuroPerArtist: Infinity,
					usersFor1PlatformSalary: Infinity
				}
			: {
					usersFor1EuroPerArtist: Math.ceil(
						(1 * totalArtists) / (p.avgContribution * retention * (p.artistReachabilityPct / 100))
					),
					usersFor10EuroPerArtist: Math.ceil(
						(10 * totalArtists) / (p.avgContribution * retention * (p.artistReachabilityPct / 100))
					),
					usersFor1PlatformSalary: Math.ceil(1 / (p.avgContribution * (p.platformCutPct / 100)))
				}

	const periods: Array<{label: string; months: number}> = [
		{label: '1 month', months: 1},
		{label: '6 months', months: 6},
		{label: '1 year', months: 12},
		{label: '5 years', months: 60},
		{label: '10 years', months: 120}
	]
	const growth = 1 + p.monthlyGrowthRatePct / 100
	const projections: Projection[] = periods.map(({label, months}) => {
		const cumGross =
			growth === 1 ? grossPool * months : grossPool * ((growth ** months - 1) / (growth - 1))
		const cumArtist = cumGross * retention
		return {
			label,
			months,
			totalPool: cumGross,
			totalArtistPool: cumArtist,
			avgMonthlyPerArtist: totalArtists > 0 ? cumArtist / months / totalArtists : 0
		}
	})

	// Fixed illustration scenarios (10% platform + 20% curators)
	const scenarioCuts = (1 - 0.1) * (1 - 0.2)
	const scenarios: Scenario[] = [
		{label: 'Small start', channels: 50, avgContrib: 5},
		{label: 'Early adopters', channels: 100, avgContrib: 10},
		{label: 'Growing community', channels: 500, avgContrib: 15},
		{label: 'Established base', channels: 1000, avgContrib: 20},
		{label: 'Thriving platform', channels: 5000, avgContrib: 25}
	].map(({label, channels, avgContrib}) => {
		const gross = channels * avgContrib
		return {label, channels, avgContrib, grossPool: gross, netArtistPool: gross * scenarioCuts}
	})

	return {
		grossPool,
		platformShare,
		netPool,
		curatorPool,
		artistPool,
		reachableArtistPool,
		pendingArtistPool,
		totalTracks,
		totalArtists,
		perTrack,
		perArtist,
		perTrackWeighted,
		breakeven,
		projections,
		scenarios,
		retention
	}
}

export function computeChannelEconomy(
	result: EconomyResult,
	trackCount: number,
	algorithm: Algorithm,
	uniqueArtistRatio: number
): ChannelResult {
	const estimatedArtists = Math.round(trackCount * uniqueArtistRatio)
	const trackShare = result.totalTracks > 0 ? trackCount / result.totalTracks : 0

	let monthlyArtistEarnings: number
	if (algorithm === 'equal_per_artist') {
		monthlyArtistEarnings = result.perArtist * estimatedArtists
	} else {
		monthlyArtistEarnings = result.perTrack * trackCount
	}

	const monthlyCuratorEarnings = result.curatorPool * trackShare

	const projections = result.projections.map((proj) => ({
		label: proj.label,
		months: proj.months,
		earnings:
			result.totalTracks > 0 ? (proj.totalArtistPool / proj.months) * trackShare * proj.months : 0
	}))

	return {trackShare, estimatedArtists, monthlyArtistEarnings, monthlyCuratorEarnings, projections}
}

export function formatEuro(n: number): string {
	if (!Number.isFinite(n) || n < 0) return '—'
	if (n === 0) return '0.00 €'
	if (n < 0.01) return '<0.01 €'
	if (n < 10) return `${n.toFixed(3)} €`
	if (n < 1000) return `${n.toFixed(2)} €`
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k €`
	return `${(n / 1_000_000).toFixed(2)}M €`
}

export function formatCount(n: number): string {
	if (!Number.isFinite(n)) return '—'
	return Math.round(n).toLocaleString('en')
}

export function formatPct(n: number): string {
	if (n < 0.01) return '<0.01%'
	if (n < 0.1) return `${(n * 100).toFixed(3)}%`
	return `${(n * 100).toFixed(2)}%`
}

export function monthsLabel(n: number): string {
	if (n === 1) return '1 month'
	if (n < 12) return `${n} months`
	if (n === 12) return '1 year'
	if (n % 12 === 0) return `${n / 12} years`
	const y = Math.floor(n / 12)
	const m = n % 12
	return `${y}y ${m}mo`
}

export interface PointInTime {
	months: number
	label: string
	monthlyGross: number
	monthlyPlatform: number
	monthlyCuratorPool: number
	monthlyArtistPool: number
	monthlyReachableArtistPool: number
	monthlyPerArtist: number
	cumulativeGross: number
	cumulativePlatform: number
	cumulativeArtistPool: number
}

export function computePointInTime(
	result: EconomyResult,
	p: EconomyParams,
	months: number
): PointInTime {
	const growth = 1 + p.monthlyGrowthRatePct / 100
	const scale = growth ** (months - 1)
	const monthlyGross = result.grossPool * scale
	const monthlyPlatform = monthlyGross * (p.platformCutPct / 100)
	const monthlyNet = monthlyGross - monthlyPlatform
	const monthlyCuratorPool = monthlyNet * (p.curatorAllocationPct / 100)
	const monthlyArtistPool = monthlyNet - monthlyCuratorPool
	const monthlyReachableArtistPool = monthlyArtistPool * (p.artistReachabilityPct / 100)
	const monthlyPerArtist =
		result.totalArtists > 0 ? monthlyReachableArtistPool / result.totalArtists : 0

	const cumGross =
		growth === 1
			? result.grossPool * months
			: result.grossPool * ((growth ** months - 1) / (growth - 1))

	return {
		months,
		label: monthsLabel(months),
		monthlyGross,
		monthlyPlatform,
		monthlyCuratorPool,
		monthlyArtistPool,
		monthlyReachableArtistPool,
		monthlyPerArtist,
		cumulativeGross: cumGross,
		cumulativePlatform: cumGross * (p.platformCutPct / 100),
		cumulativeArtistPool: cumGross * result.retention
	}
}

export function salaryCoverage(monthlyAmount: number, referenceSalary: number): number {
	if (referenceSalary <= 0) return 0
	return monthlyAmount / referenceSalary
}

export function formatSalary(coverage: number): string {
	if (!Number.isFinite(coverage) || coverage < 0) return '—'
	if (coverage < 0.05) return 'less than 5% of a salary'
	if (coverage < 1) return `${Math.round(coverage * 100)}% of a salary`
	return `${coverage.toFixed(1)} ${coverage < 1.5 ? 'salary' : 'salaries'}`
}
