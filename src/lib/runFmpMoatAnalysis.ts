import { computeMoatAnalysis, type MoatAnalysis } from './computeMoatAnalysis'
import { DEMO_TICKERS } from './demoTickerMap'
import { defaultFetchPeersForFmpPipeline } from './dataSource'
import { buildCompanyFacts } from './fmp/buildCompanyFacts'
import { fetchCompanyRawPack } from './fmp/fetchCompanyRawPack'
import { EMPTY_PEER_MEDIANS, fetchPeerMedians } from './fmp/peerMedians'
import { mapFmpSectorToProfile } from './fmp/mapSectorToProfile'
import { buildMoatFundamentalsSnapshot } from './moatFundamentalsSnapshot'
import { loadSectorProfiles } from './loadSectorProfiles'
import { createLiveMetricEvaluator } from './liveMetricEvaluator'
import { resolveProfileMetrics } from './resolveProfileMetrics'

export interface RunFmpMoatAnalysisOptions {
  profileMode?: 'auto' | 'manual'
  manualProfile?: string
  /** Defaults: Vite app uses dev/prod rules; Node worker uses SCREEN_FETCH_PEERS (on unless false). */
  fetchPeers?: boolean
}

/**
 * Full FMP moat analysis (same pipeline as the main app FMP path).
 * Used by the nightly screener worker and can be reused by the UI.
 */
export async function runFmpMoatAnalysis(
  symbol: string,
  fmpApiKey: string,
  opts: RunFmpMoatAnalysisOptions = {},
): Promise<MoatAnalysis> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) {
    throw new Error('Missing symbol')
  }
  const profileMode = opts.profileMode ?? 'auto'
  const manualProfile = opts.manualProfile ?? 'consumer_staples_discretionary_general'
  const fetchPeers = opts.fetchPeers ?? defaultFetchPeersForFmpPipeline()

  const pack = await fetchCompanyRawPack(sym, fmpApiKey)
  const facts = buildCompanyFacts(sym, pack)
  const peerMedians = fetchPeers
    ? await fetchPeerMedians(pack.peers, fmpApiKey, { subjectSymbol: sym })
    : EMPTY_PEER_MEDIANS

  const routing =
    profileMode === 'auto'
      ? mapFmpSectorToProfile(facts.sector, facts.industry)
      : { profileId: manualProfile, subIndustryHint: facts.industry }

  const root = loadSectorProfiles()
  const profile = root.profiles[routing.profileId]
  if (!profile) {
    throw new Error(`Unknown profile id: ${routing.profileId}`)
  }

  const resolved = resolveProfileMetrics(routing.profileId, profile, {
    itVariant: profileMode === 'manual' ? DEMO_TICKERS[sym]?.itVariant : undefined,
    subIndustryHint: routing.subIndustryHint,
  })

  const peerSnapshot = peerMedians.n > 0 ? peerMedians : null
  const evaluate = createLiveMetricEvaluator(sym, facts, peerSnapshot)

  return computeMoatAnalysis(
    sym,
    facts.companyName,
    routing.profileId,
    resolved.metrics,
    resolved.itVariant,
    evaluate,
    {
      sector: facts.sector,
      industry: facts.industry,
      dataSource: 'fmp',
      fundamentals: buildMoatFundamentalsSnapshot(facts, pack),
    },
  )
}
