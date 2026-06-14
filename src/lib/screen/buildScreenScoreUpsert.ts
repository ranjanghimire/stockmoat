import type { MoatAnalysis } from '../computeMoatAnalysis'
import {
  extractForwardRevenueEstimateWindow,
  forwardRevenueCagrFromCharts,
  isForwardRevenueMonotonic,
} from '../fmp/forwardRevenueGrowthScore'

export interface ScreenScoreUpsertRow {
  symbol: string
  display_name: string
  score: number
  profile_id: string
  sector: string | null
  industry: string | null
  any_gate_fail: boolean
  score_cap: number | null
  raw_weighted: number | null
  forward_rev_cagr_3y: number | null
  forward_growth_score: null
  valuation_score: number | null
  quality_score: number | null
  balance_sheet_score: number | null
  cash_truth_score: number | null
  stability_score: number | null
  market_cap_usd: number | null
  ffv2_price_ratio: number | null
  upside_to_ffv2_pct: number | null
  forward_rev_monotonic_3y: boolean | null
  updated_at: string
}

function pillarScore(analysis: MoatAnalysis, pillarId: string): number | null {
  const p = analysis.pillars.find((x) => x.pillar === pillarId)
  if (!p || typeof p.pillarScore !== 'number' || !Number.isFinite(p.pillarScore)) return null
  return p.pillarScore
}

function ffv2PriceRatio(analysis: MoatAnalysis): number | null {
  const fairValue = analysis.fundamentals?.fairValue
  const ffv2Base = fairValue?.ffv2?.base
  const price = fairValue?.marketPrice
  if (ffv2Base === undefined || price === undefined || !Number.isFinite(ffv2Base) || !Number.isFinite(price)) {
    return null
  }
  if (price <= 0) return null
  const ratio = ffv2Base / price
  return Number.isFinite(ratio) ? ratio : null
}

function forwardRevMonotonicFlag(analysis: MoatAnalysis): boolean | null {
  const charts = analysis.fundamentals?.forwardGrowth
  if (!charts) return null
  if (!extractForwardRevenueEstimateWindow(charts)) return null
  return isForwardRevenueMonotonic(charts)
}

export function buildScreenScoreUpsert(analysis: MoatAnalysis, updatedAt = new Date().toISOString()): ScreenScoreUpsertRow {
  const forwardGrowth = analysis.fundamentals?.forwardGrowth
  const fairValue = analysis.fundamentals?.fairValue

  return {
    symbol: analysis.ticker,
    display_name: analysis.displayName,
    score: analysis.score,
    profile_id: analysis.profileId,
    sector: analysis.sector ?? null,
    industry: analysis.industry ?? null,
    any_gate_fail: analysis.anyGateFail,
    score_cap: analysis.scoreCap,
    raw_weighted: analysis.rawWeighted,
    forward_rev_cagr_3y: forwardRevenueCagrFromCharts(forwardGrowth) ?? null,
    forward_growth_score: null,
    valuation_score: pillarScore(analysis, 'valuation'),
    quality_score: pillarScore(analysis, 'quality'),
    balance_sheet_score: pillarScore(analysis, 'safety'),
    cash_truth_score: pillarScore(analysis, 'cash_truth'),
    stability_score: pillarScore(analysis, 'stability'),
    market_cap_usd: analysis.fundamentals?.marketCapUsd ?? null,
    ffv2_price_ratio: ffv2PriceRatio(analysis),
    upside_to_ffv2_pct: fairValue?.upsideToFfv2Pct ?? null,
    forward_rev_monotonic_3y: forwardRevMonotonicFlag(analysis),
    updated_at: updatedAt,
  }
}
