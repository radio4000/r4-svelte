<script lang="ts">
	import {resolve} from '$app/paths'
	import {appName} from '$lib/config'
	import {appState} from '$lib/app-state.svelte'
	import {sdk} from '@radio4000/sdk'
	import {fetchChannelCount} from '$lib/collections/channels'
	import {searchChannelsCombined} from '$lib/search.js'
	import BackLink from '$lib/components/back-link.svelte'
	import InputRange from '$lib/components/input-range.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import {
		computeEconomy,
		computeChannelEconomy,
		computePointInTime,
		salaryCoverage,
		formatEuro,
		formatCount,
		formatPct,
		formatSalary,
		monthsLabel,
		DEFAULTS,
		type Algorithm,
		type EconomyParams
	} from './economy'
	import type {Channel} from '$lib/types'

	// --- Tab state ---
	let tab = $state<'ecosystem' | 'channel'>('ecosystem')

	// --- Parameters ---
	let payingUsers = $state(100)
	let avgContribution = $state(10)
	let platformCutPct = $state(10)
	let curatorAllocationPct = $state(20)
	let artistReachabilityPct = $state(20)
	let algorithm = $state<Algorithm>('equal_per_track')
	let uniqueArtistRatio = $state(DEFAULTS.AVG_UNIQUE_ARTIST_RATIO)
	let monthlyGrowthRatePct = $state(2)
	let referenceSalary = $state(3000)
	let projectionMonths = $state(12)

	// --- Platform scale: real data from DB ---
	let channelCount = $state<number>(DEFAULTS.FALLBACK_CHANNEL_COUNT)
	let totalTracks = $state(0)
	let dataLive = $state(false)

	// avgTracksPerChannel: real when DB data loaded, else fallback
	const avgTracksPerChannel = $derived(
		dataLive && channelCount > 0
			? Math.round(totalTracks / channelCount)
			: DEFAULTS.AVG_TRACKS_PER_CHANNEL
	)

	$effect(() => {
		void fetchChannelCount().then((n) => {
			if (n > 0) channelCount = n
		})
		void sdk.supabase
			.from('channel_tracks')
			.select('*', {count: 'exact', head: true})
			.then(({count}) => {
				if (count) {
					totalTracks = count
					dataLive = true
				}
			})
	})

	// --- Channel search ---
	let searchQuery = $state('')
	let searchResults = $state<Channel[]>([])
	let searchLoading = $state(false)
	let selectedChannel = $state<Channel | null>(null)

	$effect(() => {
		const q = searchQuery.trim()
		if (!q) {
			searchResults = []
			return
		}
		searchLoading = true
		searchChannelsCombined({query: q}).then((results) => {
			searchResults = results.slice(0, 8)
			searchLoading = false
		})
	})

	function selectChannel(ch: Channel) {
		selectedChannel = ch
		searchQuery = ''
		searchResults = []
	}

	function selectUserChannel() {
		if (appState.channel) {
			selectedChannel = appState.channel as Channel
			tab = 'channel'
		}
	}

	// --- Global simulation ---
	const params = $derived<EconomyParams>({
		payingUsers,
		avgContribution,
		platformCutPct,
		curatorAllocationPct,
		artistReachabilityPct,
		algorithm,
		channelCount,
		avgTracksPerChannel,
		uniqueArtistRatio,
		monthlyGrowthRatePct
	})

	const result = $derived(computeEconomy(params))

	// --- Timeline scrubber ---
	const pointInTime = $derived(computePointInTime(result, params, projectionMonths))

	// --- Channel-specific simulation ---
	const channelResult = $derived(
		selectedChannel?.track_count
			? computeChannelEconomy(result, selectedChannel.track_count, algorithm, uniqueArtistRatio)
			: null
	)

	// --- Party bar widths (% of gross) ---
	const barPlatform = $derived(
		result.grossPool > 0 ? (result.platformShare / result.grossPool) * 100 : 0
	)
	const barCurator = $derived(
		result.grossPool > 0 ? (result.curatorPool / result.grossPool) * 100 : 0
	)
	const barArtistReachable = $derived(
		result.grossPool > 0 ? (result.reachableArtistPool / result.grossPool) * 100 : 0
	)
	const barArtistPending = $derived(
		result.grossPool > 0 ? (result.pendingArtistPool / result.grossPool) * 100 : 0
	)
</script>

<svelte:head>
	<title>Economy — {appName}</title>
</svelte:head>

<div class="economy fill-height">
	<!-- ═══ SIDEBAR ═══ -->
	<aside class="sidebar">
		<div class="sidebar-header">
			<BackLink href={resolve('/about')} />
			<span class="sidebar-title">Economy</span>
		</div>

		<div class="sidebar-concept">
			<p>
				Listeners give what feels right. Every euro splits three ways — the platform team, the
				curators, and the artists.
			</p>
			<p class="concept-note">Move the sliders. Numbers update instantly.</p>
		</div>

		<details class="param-section" open>
			<summary>Contributions</summary>
			<label>
				<span class="param-label">{formatCount(payingUsers)} people contributing</span>
				<InputRange bind:value={payingUsers} min={0} max={20000} step={50} visualStep={2000} />
			</label>
			<label>
				<span class="param-label">{avgContribution} € each, per month</span>
				<InputRange bind:value={avgContribution} min={1} max={200} step={1} visualStep={20} />
				<small>No fixed plans — everyone gives what they feel is right.</small>
			</label>
		</details>

		<details class="param-section" open>
			<summary>The three-way split</summary>
			<label>
				<span class="param-label">Platform team — {platformCutPct}%</span>
				<InputRange bind:value={platformCutPct} min={0} max={20} step={1} visualStep={5} />
				<small>Covers servers, development, and the people running Radio4000.</small>
			</label>
			<label>
				<span class="param-label">Curators — {curatorAllocationPct}%</span>
				<InputRange bind:value={curatorAllocationPct} min={0} max={20} step={1} visualStep={5} />
				<small
					>Channel owners — the people who discover and collect the music. Distributed in proportion
					to track count.</small
				>
			</label>
			<p class="param-derived">
				Artists get the rest — <strong>{100 - platformCutPct - curatorAllocationPct}%</strong> of every
				contribution.
			</p>
		</details>

		<details class="param-section" open>
			<summary>Artist reachability</summary>
			<label>
				<span class="param-label"
					>{artistReachabilityPct}% of artists can be identified and paid</span
				>
				<InputRange bind:value={artistReachabilityPct} min={0} max={100} step={5} visualStep={20} />
				<small
					>This is the hard part. The rest accumulates until an artist can be reached — via opt-in,
					a CMO, or a grant pool.</small
				>
			</label>
			<label>
				<span class="param-label">Split rule</span>
				<select class="select" bind:value={algorithm}>
					<option value="equal_per_track">Every referenced song earns equally</option>
					<option value="equal_per_artist">Every artist earns equally</option>
					<option value="track_weighted">Recent additions earn more</option>
				</select>
			</label>
			{#if algorithm === 'equal_per_artist'}
				<label>
					<span class="param-label"
						>Distinct artist ratio — {Math.round(uniqueArtistRatio * 100)}%</span
					>
					<InputRange
						bind:value={uniqueArtistRatio}
						min={0.1}
						max={1}
						step={0.05}
						visualStep={0.1}
					/>
					<small>Estimated share of tracks that are from distinct artists.</small>
				</label>
			{/if}
		</details>

		<details class="param-section" open>
			<summary>Growth &amp; salary reference</summary>
			<label>
				<span class="param-label">{monthlyGrowthRatePct}% more contributors each month</span>
				<InputRange bind:value={monthlyGrowthRatePct} min={0} max={20} step={0.5} visualStep={4} />
			</label>
			<label>
				<span class="param-label">Salary reference — {referenceSalary} € / month</span>
				<InputRange
					bind:value={referenceSalary}
					min={500}
					max={10000}
					step={100}
					visualStep={1000}
				/>
				<small>Bruto monthly salary used to contextualise the amounts.</small>
			</label>
		</details>

		<details class="param-section scale-stats" open>
			<summary>Radio4000 today</summary>
			<dl class="scale-dl">
				<dt>Channels</dt>
				<dd>
					{formatCount(channelCount)}
					<span class="live-badge" class:live={dataLive}>{dataLive ? 'live' : 'est.'}</span>
				</dd>
				<dt>Tracks referenced</dt>
				<dd>
					{formatCount(dataLive ? totalTracks : result.totalTracks)}
					<span class="live-badge" class:live={dataLive}>{dataLive ? 'live' : 'est.'}</span>
				</dd>
				<dt>Avg per channel</dt>
				<dd>{formatCount(avgTracksPerChannel)} tracks</dd>
				<dt>Artists reached (est.)</dt>
				<dd>{formatCount(result.totalArtists)}</dd>
			</dl>
		</details>
	</aside>

	<!-- ═══ MAIN ═══ -->
	<div class="main">
		<!-- Tab bar -->
		<nav class="tab-bar">
			<button
				class="tab-btn"
				class:active={tab === 'ecosystem'}
				onclick={() => (tab = 'ecosystem')}
			>
				The big picture
			</button>
			<button class="tab-btn" class:active={tab === 'channel'} onclick={() => (tab = 'channel')}>
				A channel's share
			</button>

			{#if appState.channel && tab !== 'channel'}
				<button class="your-channel-btn" onclick={selectUserChannel}> My channel → </button>
			{/if}
		</nav>

		<!-- ─── ECOSYSTEM TAB ─── -->
		{#if tab === 'ecosystem'}
			<div class="tab-content">
				<!-- Big numbers -->
				<div class="stat-grid">
					<div class="stat-card">
						<span class="stat-value">{formatEuro(result.grossPool)}</span>
						<span class="stat-label">contributed / month</span>
					</div>
					<div class="stat-card">
						<span class="stat-value">{formatEuro(result.platformShare)}</span>
						<span class="stat-label">platform team</span>
						{#if result.platformShare > 0}
							<span class="stat-salary"
								>{formatSalary(salaryCoverage(result.platformShare, referenceSalary))}</span
							>
						{/if}
					</div>
					<div class="stat-card">
						<span class="stat-value">{formatEuro(result.curatorPool)}</span>
						<span class="stat-label">curators</span>
						{#if result.curatorPool > 0}
							<span class="stat-salary"
								>{formatSalary(
									salaryCoverage(result.curatorPool / Math.max(channelCount, 1), referenceSalary)
								)} avg per channel</span
							>
						{/if}
					</div>
					<div class="stat-card stat-card--accent">
						<span class="stat-value">{formatEuro(result.reachableArtistPool)}</span>
						<span class="stat-label">artists — paid now</span>
						{#if result.pendingArtistPool > 0}
							<span class="stat-salary">+ {formatEuro(result.pendingArtistPool)} accumulating</span>
						{/if}
					</div>
				</div>

				<!-- Three-party split -->
				<details class="flow-section" open>
					<summary>Who gets what</summary>
					<p class="section-note">
						From every {avgContribution} € contributed, three groups receive a share.
					</p>
					<div class="parties">
						<div class="party">
							<div class="party-head">
								<span class="party-name">Platform team</span>
								<span class="party-meta"
									>{platformCutPct}% · {formatEuro(result.platformShare)}/mo · {formatSalary(
										salaryCoverage(result.platformShare, referenceSalary)
									)}</span
								>
							</div>
							<div class="party-track">
								<div class="party-fill party-fill--platform" style="width: {barPlatform}%"></div>
							</div>
							<p class="party-desc">
								Covers servers, development, and the people keeping Radio4000 running.
							</p>
						</div>

						<div class="party">
							<div class="party-head">
								<span class="party-name">Curators</span>
								<span class="party-meta"
									>{curatorAllocationPct}% · {formatEuro(result.curatorPool)}/mo</span
								>
							</div>
							<div class="party-track">
								<div class="party-fill party-fill--curator" style="width: {barCurator}%"></div>
							</div>
							<p class="party-desc">
								Channel owners — the people who discover, collect, and annotate the music. Split
								proportionally to their track count.
							</p>
						</div>

						<div class="party">
							<div class="party-head">
								<span class="party-name">Artists</span>
								<span class="party-meta"
									>{100 - platformCutPct - curatorAllocationPct}% · {formatEuro(
										result.artistPool
									)}/mo total</span
								>
							</div>
							<div class="party-track">
								<div
									class="party-fill party-fill--artist-reach"
									style="width: {barArtistReachable}%"
								></div>
								<div
									class="party-fill party-fill--artist-pending"
									style="width: {barArtistPending}%"
								></div>
							</div>
							<div class="party-artist-split">
								<span class="party-split-item party-split-item--reach">
									<span class="party-split-dot"></span>
									{formatEuro(result.reachableArtistPool)}/mo paid now ({artistReachabilityPct}%
									identifiable)
								</span>
								<span class="party-split-item party-split-item--pending">
									<span class="party-split-dot"></span>
									{formatEuro(result.pendingArtistPool)}/mo accumulating — held until more artists
									can be reached
								</span>
							</div>
							<p class="party-desc">
								{#if algorithm === 'equal_per_track'}
									{formatCount(result.totalTracks)} referenced tracks. Each earns {formatEuro(
										result.perTrack
									)}/mo from the distributable pool.
								{:else if algorithm === 'equal_per_artist'}
									~{formatCount(result.totalArtists)} distinct artists. Each earns {formatEuro(
										result.perArtist
									)}/mo regardless of track count.
								{:else}
									Newer additions earn more — up to {formatEuro(result.perTrackWeighted.high)}/mo
									per track; older ones from {formatEuro(result.perTrackWeighted.low)}.
								{/if}
							</p>
						</div>
					</div>
				</details>

				<!-- Breakeven -->
				<details class="breakeven-section" open>
					<summary>When does it become real?</summary>
					<p class="breakeven-note">
						At {avgContribution} € average — how many contributors until each group reaches a meaningful
						milestone?
					</p>
					<div class="breakeven-grid">
						<div class="breakeven-card breakeven-card--platform">
							<span class="breakeven-who">Platform team</span>
							<span class="breakeven-n"
								>{formatCount(result.breakeven.usersFor1PlatformSalary)}</span
							>
							<span
								>contributors for the platform to pay <strong>1 salary</strong> ({referenceSalary} €/mo)</span
							>
						</div>
						<div class="breakeven-card breakeven-card--artist">
							<span class="breakeven-who">Artists</span>
							<span class="breakeven-n">{formatCount(result.breakeven.usersFor1EuroPerArtist)}</span
							>
							<span
								>contributors for each identifiable artist to earn <strong>1 €/month</strong></span
							>
						</div>
						<div class="breakeven-card breakeven-card--artist">
							<span class="breakeven-who">Artists</span>
							<span class="breakeven-n"
								>{formatCount(result.breakeven.usersFor10EuroPerArtist)}</span
							>
							<span
								>contributors for each artist to earn <strong>10 €/month</strong> — one Bandcamp sale</span
							>
						</div>
					</div>
				</details>

				<!-- Timeline scrubber -->
				<details class="projections-section" open>
					<summary>How it grows over time</summary>
					<p class="section-note">
						Drag to explore any point in the future — assuming {monthlyGrowthRatePct}% monthly
						growth.
					</p>
					<div class="scrubber">
						<div class="scrubber-header">
							<span class="scrubber-period"
								>After <strong>{monthsLabel(projectionMonths)}</strong></span
							>
							<span class="scrubber-marks">
								<button class="scrubber-mark" onclick={() => (projectionMonths = 1)}>1mo</button>
								<button class="scrubber-mark" onclick={() => (projectionMonths = 12)}>1y</button>
								<button class="scrubber-mark" onclick={() => (projectionMonths = 36)}>3y</button>
								<button class="scrubber-mark" onclick={() => (projectionMonths = 60)}>5y</button>
								<button class="scrubber-mark" onclick={() => (projectionMonths = 120)}>10y</button>
							</span>
						</div>
						<InputRange bind:value={projectionMonths} min={1} max={120} step={1} visualStep={12} />
					</div>
					<div class="proj-grid">
						<div class="proj-card">
							<span class="proj-value">{formatEuro(pointInTime.monthlyGross)}</span>
							<span class="proj-label">contributed that month</span>
						</div>
						<div class="proj-card">
							<span class="proj-value">{formatEuro(pointInTime.monthlyPlatform)}</span>
							<span class="proj-label">platform team</span>
							{#if pointInTime.monthlyPlatform > 0}
								<span class="proj-salary"
									>{formatSalary(
										salaryCoverage(pointInTime.monthlyPlatform, referenceSalary)
									)}</span
								>
							{/if}
						</div>
						<div class="proj-card">
							<span class="proj-value">{formatEuro(pointInTime.monthlyCuratorPool)}</span>
							<span class="proj-label">curators</span>
						</div>
						<div class="proj-card proj-card--accent">
							<span class="proj-value">{formatEuro(pointInTime.monthlyReachableArtistPool)}</span>
							<span class="proj-label">artists — paid now</span>
							{#if pointInTime.monthlyReachableArtistPool > 0}
								<span class="proj-salary"
									>{formatEuro(pointInTime.monthlyPerArtist)} per artist</span
								>
							{/if}
						</div>
					</div>
					<div class="proj-cumulative">
						<div class="proj-cum-item">
							<span class="proj-cum-label">Total gathered over {monthsLabel(projectionMonths)}</span
							>
							<span class="proj-cum-value">{formatEuro(pointInTime.cumulativeGross)}</span>
						</div>
						<div class="proj-cum-item">
							<span class="proj-cum-label">Flows to musicians total</span>
							<span class="proj-cum-value proj-cum-value--accent"
								>{formatEuro(pointInTime.cumulativeArtistPool)}</span
							>
						</div>
					</div>
				</details>

				<!-- Scenario comparison -->
				<details class="scenarios-section" open>
					<summary>Scale reference</summary>
					<p class="section-note">
						A few fixed examples to anchor the numbers — 10% platform, 20% channels-you-follow
						bonus.
					</p>
					<div class="table-wrap">
						<table>
							<thead>
								<tr>
									<th>Community size</th>
									<th>Contributors</th>
									<th>Avg / month</th>
									<th>Total gathered</th>
									<th>Reaches musicians</th>
								</tr>
							</thead>
							<tbody>
								{#each result.scenarios as s (s.label)}
									<tr>
										<td>{s.label}</td>
										<td>{formatCount(s.channels)}</td>
										<td>{s.avgContrib} €</td>
										<td>{formatEuro(s.grossPool)}</td>
										<td>{formatEuro(s.netArtistPool)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</details>

				<p class="disclaimer">
					This is a simulation — no money moves. All numbers update live as you adjust the sliders.
					The catalog data (channels, tracks) is real and pulled live from Radio4000.
				</p>
			</div>

			<!-- ─── CHANNEL TAB ─── -->
		{:else if tab === 'channel'}
			<div class="tab-content">
				<p class="channel-intro">
					Every channel curates music from real artists. Pick one — yours or anyone's — to see how
					much those musicians would receive under the current parameters.
				</p>

				<!-- Quick select: your channel -->
				{#if appState.channel}
					<div class="your-channel-row">
						<span class="your-channel-label">Jump to yours</span>
						<button
							class="channel-pick-btn"
							class:selected={selectedChannel?.id === appState.channel.id}
							onclick={selectUserChannel}
						>
							{#if appState.channel.image}
								<img
									class="channel-avatar"
									src={appState.channel.image}
									alt={appState.channel.name}
									width="24"
									height="24"
								/>
							{/if}
							<span>{appState.channel.name}</span>
							<span class="channel-track-count">{appState.channel.track_count ?? '?'} tracks</span>
						</button>
					</div>
				{:else}
					<p class="login-hint">
						<a href={resolve('/auth')}>Sign in</a> to jump directly to your channel.
					</p>
				{/if}

				<!-- Search -->
				<div class="channel-search">
					<SearchInput
						bind:value={searchQuery}
						placeholder="Search for any channel…"
						debounce={300}
					/>
					{#if searchLoading}
						<p class="search-state">Searching…</p>
					{:else if searchQuery && searchResults.length === 0}
						<p class="search-state">No channels found.</p>
					{/if}
					{#if searchResults.length > 0}
						<ul class="search-results">
							{#each searchResults as ch (ch.id)}
								<li>
									<button class="channel-pick-btn" onclick={() => selectChannel(ch)}>
										{#if ch.image}
											<img
												class="channel-avatar"
												src={ch.image}
												alt={ch.name}
												width="24"
												height="24"
											/>
										{/if}
										<span class="channel-name">{ch.name}</span>
										<span class="channel-slug">/{ch.slug}</span>
										<span class="channel-track-count">{ch.track_count ?? '?'} tracks</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<!-- Selected channel projection -->
				{#if selectedChannel && channelResult}
					{@const ch = selectedChannel}
					{@const cr = channelResult}
					<div class="channel-projection">
						<div class="channel-header">
							{#if ch.image}
								<img
									class="channel-avatar-lg"
									src={ch.image}
									alt={ch.name}
									width="48"
									height="48"
								/>
							{/if}
							<div>
								<h2 class="channel-name-lg">{ch.name}</h2>
								<a class="channel-slug-link" href={resolve('/[slug]', {slug: ch.slug})}
									>/{ch.slug}</a
								>
							</div>
						</div>

						<!-- Stats row -->
						<div class="channel-stats">
							<div class="channel-stat">
								<span class="stat-n">{formatCount(ch.track_count ?? 0)}</span>
								<span>songs curated</span>
							</div>
							<div class="channel-stat">
								<span class="stat-n">{formatPct(cr.trackShare)}</span>
								<span>of the entire catalog</span>
							</div>
							{#if algorithm === 'equal_per_artist'}
								<div class="channel-stat">
									<span class="stat-n">{formatCount(cr.estimatedArtists)}</span>
									<span>distinct artists (est.)</span>
								</div>
							{/if}
						</div>

						<!-- Earning highlights — two parties -->
						<div class="earning-pair">
							<div class="earning-highlight earning-highlight--curator">
								<span class="earning-value">{formatEuro(cr.monthlyCuratorEarnings)}</span>
								<span class="earning-label">to you, as curator</span>
								<span class="earning-sublabel"
									>your {formatPct(cr.trackShare)} of the curator pool</span
								>
							</div>
							<div class="earning-highlight earning-highlight--artist">
								<span class="earning-value">{formatEuro(cr.monthlyArtistEarnings)}</span>
								<span class="earning-label">to {ch.name}'s artists</span>
								<span class="earning-sublabel">from the distributable artist pool</span>
							</div>
						</div>
						<p class="earning-note">
							The {formatEuro(result.reachableArtistPool)} distributable artist pool ({artistReachabilityPct}%
							of artists identified) is shared across all {formatCount(result.totalTracks)} referenced
							tracks.
							{ch.name} holds {formatPct(cr.trackShare)} of those. The {formatEuro(
								result.pendingArtistPool
							)}/mo artist remainder accumulates until more artists can be reached.
						</p>

						<!-- Channel projections -->
						<div class="table-wrap">
							<table>
								<thead>
									<tr>
										<th>After</th>
										<th>{ch.name}'s artists earn</th>
										<th>Global musician pool</th>
									</tr>
								</thead>
								<tbody>
									{#each cr.projections as proj (proj.label)}
										<tr>
											<td>{proj.label}</td>
											<td class="accent-cell">{formatEuro(proj.earnings)}</td>
											<td
												>{formatEuro(
													result.projections.find((p) => p.label === proj.label)?.totalArtistPool ??
														0
												)}</td
											>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>

						<!-- Comparison: avg vs this channel vs large channel -->
						<div class="comparison">
							<h3>Artist earnings compared</h3>
							<div class="comparison-rows">
								<div class="comparison-row">
									<span>Average channel ({avgTracksPerChannel} tracks)</span>
									<span>{formatEuro(result.perTrack * avgTracksPerChannel)} / month</span>
								</div>
								<div class="comparison-row comparison-row--selected">
									<span>{ch.name} ({ch.track_count} tracks)</span>
									<span>{formatEuro(cr.monthlyArtistEarnings)} / month</span>
								</div>
								<div class="comparison-row">
									<span>A large channel (1,000 tracks)</span>
									<span>{formatEuro(result.perTrack * 1000)} / month</span>
								</div>
							</div>
						</div>
					</div>
				{:else if !selectedChannel}
					<div class="channel-empty">
						<p>Search for a channel above, or select yours if you're signed in.</p>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	/* ─── Layout ─── */
	.economy {
		display: grid;
		grid-template-columns: 17rem 1fr;
		overflow: hidden;
	}

	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 0;
		overflow-y: auto;
		border-right: 1px solid var(--gray-4);
		background: var(--gray-1);
	}

	div.main {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--gray-2);
	}

	/* ─── Sidebar concept blurb ─── */
	.sidebar-concept {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--gray-3);
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.sidebar-concept p {
		margin: 0;
		font-size: var(--font-3);
		line-height: 1.5;
		color: var(--gray-11);
	}

	.concept-note {
		font-size: var(--font-2) !important;
		color: var(--gray-8) !important;
	}

	/* ─── Channel tab intro ─── */
	.channel-intro {
		font-size: var(--font-4);
		color: var(--gray-10);
		line-height: 1.6;
		margin: 0;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--gray-4);
	}

	/* ─── Sidebar ─── */
	.sidebar-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--gray-4);
		position: sticky;
		top: 0;
		background: var(--gray-1);
		z-index: 2;
	}

	.sidebar-title {
		font-weight: 600;
		font-size: var(--font-4);
	}

	.param-section {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--gray-3);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.param-section > summary {
		font-size: var(--font-2);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--gray-9);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		list-style: none;
		user-select: none;
	}

	.param-section > summary::-webkit-details-marker {
		display: none;
	}

	.param-section > summary::after {
		content: '';
		width: 0.45rem;
		height: 0.45rem;
		border-right: 1.5px solid currentColor;
		border-bottom: 1.5px solid currentColor;
		transform: rotate(45deg);
		transition: transform 200ms;
		opacity: 0.5;
		flex-shrink: 0;
	}

	details.param-section:not([open]) > summary::after {
		transform: rotate(-45deg);
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.param-label {
		font-size: var(--font-3);
		color: var(--gray-11);
	}

	small {
		font-size: var(--font-2);
		color: var(--gray-8);
		line-height: 1.4;
	}

	.select {
		align-self: flex-start;
		padding: 0.25rem 0.4rem;
		border: 1px solid var(--gray-5);
		border-radius: var(--border-radius);
		background: var(--gray-1);
		color: var(--gray-12);
		font-size: var(--font-3);
	}

	.scale-stats {
		margin-top: auto;
	}

	.scale-dl {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.15rem 0.5rem;
		font-size: var(--font-3);
	}

	.scale-dl dt {
		color: var(--gray-9);
	}

	.scale-dl dd {
		text-align: right;
		margin: 0;
		color: var(--gray-11);
		display: flex;
		align-items: center;
		gap: 0.3rem;
		justify-content: flex-end;
	}

	.live-badge {
		font-size: var(--font-1);
		padding: 0.1rem 0.3rem;
		border-radius: 2px;
		background: var(--gray-4);
		color: var(--gray-9);
	}

	.live-badge.live {
		background: var(--accent-3);
		color: var(--accent-11);
	}

	/* ─── Tab bar ─── */
	.tab-bar {
		display: flex;
		align-items: center;
		gap: 0;
		padding: 0 1rem;
		border-bottom: 1px solid var(--gray-4);
		background: var(--gray-1);
		flex-shrink: 0;
	}

	.tab-btn {
		padding: 0.75rem 1rem;
		border: none;
		border-bottom: 2px solid transparent;
		background: none;
		color: var(--gray-9);
		font-size: var(--font-4);
		cursor: pointer;
		transition:
			color 150ms,
			border-color 150ms;
		margin-bottom: -1px;
	}

	.tab-btn:hover {
		color: var(--gray-12);
	}

	.tab-btn.active {
		color: var(--gray-12);
		border-bottom-color: var(--accent-9);
		font-weight: 500;
	}

	.your-channel-btn {
		margin-left: auto;
		padding: 0.35rem 0.75rem;
		border: 1px solid var(--gray-5);
		border-radius: var(--border-radius);
		background: var(--gray-2);
		color: var(--gray-11);
		font-size: var(--font-3);
		cursor: pointer;
		transition: background 150ms;
	}

	.your-channel-btn:hover {
		background: var(--gray-3);
	}

	/* ─── Tab content ─── */
	.tab-content {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	/* ─── Stat grid ─── */
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
	}

	.stat-card {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 1rem 1.25rem;
		background: var(--gray-1);
		border: 1px solid var(--gray-4);
		border-radius: var(--border-radius);
	}

	.stat-card--accent {
		background: var(--accent-2);
		border-color: var(--accent-5);
	}

	.stat-value {
		font-size: var(--font-7);
		font-weight: 700;
		line-height: 1;
		color: var(--gray-12);
	}

	.stat-card--accent .stat-value {
		color: var(--accent-11);
	}

	.stat-label {
		font-size: var(--font-2);
		color: var(--gray-9);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	/* ─── Flow visualization ─── */
	.flow-section > summary,
	.breakeven-section > summary,
	.projections-section > summary,
	.scenarios-section > summary {
		font-size: var(--font-5);
		font-weight: 600;
		margin: 0 0 0.75rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		list-style: none;
		user-select: none;
	}

	.flow-section > summary::-webkit-details-marker,
	.breakeven-section > summary::-webkit-details-marker,
	.projections-section > summary::-webkit-details-marker,
	.scenarios-section > summary::-webkit-details-marker {
		display: none;
	}

	.flow-section > summary::after,
	.breakeven-section > summary::after,
	.projections-section > summary::after,
	.scenarios-section > summary::after {
		content: '';
		width: 0.55rem;
		height: 0.55rem;
		border-right: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		transform: rotate(45deg);
		transition: transform 200ms;
		opacity: 0.4;
		flex-shrink: 0;
		margin-bottom: 0.1rem;
	}

	details.flow-section:not([open]) > summary::after,
	details.breakeven-section:not([open]) > summary::after,
	details.projections-section:not([open]) > summary::after,
	details.scenarios-section:not([open]) > summary::after {
		transform: rotate(-45deg);
	}

	/* ─── Three-party split ─── */
	.parties {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.party {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.party-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.party-name {
		font-size: var(--font-4);
		font-weight: 600;
		color: var(--gray-12);
	}

	.party-meta {
		font-size: var(--font-2);
		color: var(--gray-9);
		flex-shrink: 0;
	}

	.party-track {
		height: 1.5rem;
		background: var(--gray-3);
		border-radius: var(--border-radius);
		overflow: hidden;
		display: flex;
	}

	.party-fill {
		height: 100%;
		transition: width 400ms ease;
		flex-shrink: 0;
	}

	.party-fill--platform {
		background: var(--gray-8);
	}

	.party-fill--curator {
		background: var(--gray-10);
	}

	.party-fill--artist-reach {
		background: var(--accent-9);
	}

	.party-fill--artist-pending {
		background: var(--accent-4);
	}

	.party-desc {
		font-size: var(--font-2);
		color: var(--gray-9);
		margin: 0;
		line-height: 1.5;
	}

	.party-artist-split {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-size: var(--font-2);
	}

	.party-split-item {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--gray-10);
	}

	.party-split-dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.party-split-item--reach .party-split-dot {
		background: var(--accent-9);
	}

	.party-split-item--pending .party-split-dot {
		background: var(--accent-4);
		border: 1px solid var(--accent-7);
	}

	/* ─── Breakeven ─── */
	.breakeven-note {
		font-size: var(--font-3);
		color: var(--gray-10);
		margin: 0 0 0.75rem;
	}

	.breakeven-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
	}

	.breakeven-card {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 1rem;
		background: var(--gray-1);
		border: 1px solid var(--gray-4);
		border-radius: var(--border-radius);
		font-size: var(--font-3);
		color: var(--gray-10);
	}

	.breakeven-card--platform {
		border-left: 3px solid var(--gray-7);
	}

	.breakeven-card--artist {
		border-left: 3px solid var(--accent-7);
	}

	.breakeven-who {
		font-size: var(--font-1);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--gray-8);
	}

	.breakeven-n {
		font-size: var(--font-6);
		font-weight: 700;
		color: var(--gray-12);
		line-height: 1;
	}

	/* ─── Param derived note ─── */
	.param-derived {
		font-size: var(--font-2);
		color: var(--gray-9);
		margin: 0.25rem 0 0;
		padding: 0.4rem 0.6rem;
		background: var(--gray-2);
		border-radius: var(--border-radius);
	}

	/* ─── Stat salary ─── */
	.stat-salary {
		font-size: var(--font-2);
		color: var(--gray-8);
		margin-top: 0.15rem;
	}

	/* ─── Timeline scrubber ─── */
	.scrubber {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		background: var(--gray-1);
		border: 1px solid var(--gray-4);
		border-radius: var(--border-radius);
	}

	.scrubber-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.scrubber-period {
		font-size: var(--font-4);
		color: var(--gray-11);
	}

	.scrubber-marks {
		display: flex;
		gap: 0.25rem;
	}

	.scrubber-mark {
		padding: 0.15rem 0.4rem;
		border: 1px solid var(--gray-4);
		border-radius: var(--border-radius);
		background: var(--gray-2);
		color: var(--gray-9);
		font-size: var(--font-2);
		cursor: pointer;
		transition: background 150ms;
	}

	.scrubber-mark:hover {
		background: var(--gray-3);
		color: var(--gray-11);
	}

	.proj-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	.proj-card {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.75rem 1rem;
		background: var(--gray-1);
		border: 1px solid var(--gray-4);
		border-radius: var(--border-radius);
	}

	.proj-card--accent {
		background: var(--accent-2);
		border-color: var(--accent-5);
	}

	.proj-value {
		font-size: var(--font-6);
		font-weight: 700;
		line-height: 1;
		color: var(--gray-12);
	}

	.proj-card--accent .proj-value {
		color: var(--accent-11);
	}

	.proj-label {
		font-size: var(--font-2);
		color: var(--gray-9);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.proj-salary {
		font-size: var(--font-2);
		color: var(--gray-8);
		margin-top: 0.1rem;
	}

	.proj-cumulative {
		display: flex;
		gap: 1.5rem;
		padding: 0.75rem 1rem;
		background: var(--gray-1);
		border: 1px solid var(--gray-3);
		border-radius: var(--border-radius);
		margin-top: 0.75rem;
	}

	.proj-cum-item {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.proj-cum-label {
		font-size: var(--font-2);
		color: var(--gray-9);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.proj-cum-value {
		font-size: var(--font-5);
		font-weight: 700;
		color: var(--gray-12);
	}

	.proj-cum-value--accent {
		color: var(--accent-11);
	}

	/* ─── Tables ─── */
	.section-note {
		font-size: var(--font-3);
		color: var(--gray-9);
		margin: 0 0 0.75rem;
	}

	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--gray-4);
		border-radius: var(--border-radius);
		background: var(--gray-1);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-3);
	}

	th {
		font-size: var(--font-2);
		font-weight: 500;
		color: var(--gray-9);
		background: var(--gray-2);
		text-align: left;
		padding: 0.5rem 0.75rem;
		white-space: nowrap;
		border-bottom: 1px solid var(--gray-4);
	}

	td {
		padding: 0.5rem 0.75rem;
		border-top: 1px solid var(--gray-3);
	}

	.accent-cell {
		font-weight: 600;
		color: var(--accent-11);
	}

	tbody tr:hover td {
		background: var(--gray-2);
	}

	.disclaimer {
		font-size: var(--font-2);
		color: var(--gray-8);
		text-align: center;
		margin: 0;
	}

	/* ─── Channel tab ─── */
	.your-channel-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--gray-4);
	}

	.your-channel-label {
		font-size: var(--font-3);
		color: var(--gray-9);
		flex-shrink: 0;
	}

	.login-hint {
		font-size: var(--font-3);
		color: var(--gray-9);
		margin: 0;
	}

	.channel-pick-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.75rem;
		border: 1px solid var(--gray-5);
		border-radius: var(--border-radius);
		background: var(--gray-1);
		color: var(--gray-12);
		font-size: var(--font-3);
		cursor: pointer;
		transition:
			background 150ms,
			border-color 150ms;
		text-align: left;
	}

	.channel-pick-btn:hover {
		background: var(--gray-2);
		border-color: var(--gray-7);
	}

	.channel-pick-btn.selected {
		border-color: var(--accent-7);
		background: var(--accent-2);
	}

	.channel-avatar {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.channel-name {
		font-weight: 500;
	}

	.channel-slug {
		color: var(--gray-9);
		font-size: var(--font-2);
	}

	.channel-track-count {
		margin-left: auto;
		font-size: var(--font-2);
		color: var(--gray-9);
	}

	.channel-search {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.search-state {
		font-size: var(--font-3);
		color: var(--gray-9);
		margin: 0;
		padding: 0.5rem 0;
	}

	.search-results {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.search-results li {
		display: contents;
	}

	.search-results .channel-pick-btn {
		width: 100%;
	}

	/* ─── Channel projection ─── */
	.channel-projection {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.channel-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.channel-avatar-lg {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.channel-name-lg {
		font-size: var(--font-6);
		font-weight: 700;
		margin: 0;
		line-height: 1.1;
	}

	.channel-slug-link {
		font-size: var(--font-3);
		color: var(--gray-9);
	}

	.channel-stats {
		display: flex;
		gap: 1.5rem;
	}

	.channel-stat {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.stat-n {
		font-size: var(--font-5);
		font-weight: 700;
	}

	.channel-stat span:last-child {
		font-size: var(--font-2);
		color: var(--gray-9);
	}

	.earning-pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.earning-highlight {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.2rem;
		padding: 1rem 1.25rem;
		border-radius: var(--border-radius);
	}

	.earning-highlight--curator {
		background: var(--gray-2);
		border: 1px solid var(--gray-5);
	}

	.earning-highlight--artist {
		background: var(--accent-2);
		border: 1px solid var(--accent-5);
	}

	.earning-value {
		font-size: var(--font-7);
		font-weight: 800;
		line-height: 1;
		color: var(--gray-12);
	}

	.earning-highlight--artist .earning-value {
		color: var(--accent-11);
	}

	.earning-label {
		font-size: var(--font-3);
		font-weight: 500;
		color: var(--gray-10);
	}

	.earning-highlight--artist .earning-label {
		color: var(--accent-10);
	}

	.earning-sublabel {
		font-size: var(--font-2);
		color: var(--gray-8);
	}

	.earning-note {
		font-size: var(--font-3);
		color: var(--gray-9);
		margin: 0;
	}

	.comparison {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.comparison h3 {
		font-size: var(--font-3);
		font-weight: 600;
		color: var(--gray-10);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 0;
	}

	.comparison-rows {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.comparison-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0.75rem;
		font-size: var(--font-3);
		color: var(--gray-10);
		background: var(--gray-1);
		border: 1px solid var(--gray-3);
		border-radius: var(--border-radius);
	}

	.comparison-row--selected {
		color: var(--gray-12);
		border-color: var(--accent-6);
		background: var(--accent-1);
		font-weight: 500;
	}

	.channel-empty {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--gray-9);
		font-size: var(--font-4);
	}

	/* ─── Responsive ─── */
	@media (max-width: 860px) {
		.stat-grid,
		.proj-grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	@media (max-width: 640px) {
		.economy {
			grid-template-columns: 1fr;
			overflow-y: auto;
		}

		.sidebar {
			overflow-y: visible;
			border-right: none;
			border-bottom: 1px solid var(--gray-4);
		}

		.main {
			overflow: visible;
		}

		.tab-content {
			overflow-y: visible;
		}

		.stat-grid {
			grid-template-columns: 1fr 1fr;
		}

		.breakeven-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
