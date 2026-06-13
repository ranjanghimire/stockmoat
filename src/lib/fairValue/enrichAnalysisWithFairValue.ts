import type { MoatAnalysis } from '../computeMoatAnalysis'
import type { CompanyFacts } from '../fmp/buildCompanyFacts'
import type { CompanyRawPack } from '../fmp/fetchCompanyRawPack'
import type { PeerMedians } from '../fmp/peerMedians'
import {
  parseForwardEstimatesFromFmp,
  resolveGrowthChartYears,
} from '../fmp/parseForwardEstimates'
import { computeFairValue, toFairValueSnapshot } from './computeFairValue'
import { resolveFairValueProfileId } from './resolveFairValueProfile'

export function enrichAnalysisWithFairValue(
  analysis: MoatAnalysis,
  ctx: { facts: CompanyFacts; peers: PeerMedians | null; pack: CompanyRawPack },
): MoatAnalysis {
  const fairProfileId = resolveFairValueProfileId(analysis.profileId, analysis.itVariant)
  if (!fairProfileId) return analysis

  const years = resolveGrowthChartYears(ctx.pack.incomeAnnual, ctx.pack.incomeQuarterly)
  const forwardEstimates = parseForwardEstimatesFromFmp(ctx.facts.symbol, ctx.pack.analystEstimates, {
    lastActualFiscalYear: years?.completed,
    maxYears: 3,
  })

  const result = computeFairValue({
    symbol: ctx.facts.symbol,
    facts: ctx.facts,
    peers: ctx.peers,
    moatScore: analysis.score,
    safetyGateFailed: analysis.anyGateFail,
    forwardEstimates,
    incomeAnnual: ctx.pack.incomeAnnual,
    incomeQuarterly: ctx.pack.incomeQuarterly,
    profileId: fairProfileId,
  })

  if (!result) return analysis

  return {
    ...analysis,
    fundamentals: {
      ...analysis.fundamentals,
      fairValue: toFairValueSnapshot(result),
    },
  }
}
