import type { CompanyFacts } from '../fmp/buildCompanyFacts'
import type { PeerMedians } from '../fmp/peerMedians'
import type { ForwardEstimatesSeries } from '../fmp/parseForwardEstimates'
import type { JsonRecord } from '../fmp/normalize'

export type FairValueProfileId = 'software_saas' | 'semis_hardware'

export type FairValueSubProfileId =
  | 'profitable_saas'
  | 'growth_saas'
  | 'transitional_saas'
  | 'semis_mid_cycle'
  | 'semis_peak_cycle'
  | 'semis_trough_cycle'
  | 'insufficient'

export type FairValueMethodId =
  | 'ev_gross_profit'
  | 'ev_revenue'
  | 'ev_ebitda'
  | 'ev_ebit'
  | 'fcf_yield_peer'
  | 'fcf_yield_own_5y'
  | 'peg_implied_pe'
  | 'pe_trailing'

export type MethodStatus = 'ok' | 'skipped' | 'fallback'

export interface FairValueBand {
  low: number
  base: number
  high: number
}

export interface FairValueMethodResult {
  methodId: FairValueMethodId
  status: MethodStatus
  cfvPerShare?: number
  ffv2PerShare?: number
  weight: number
  effectiveWeight: number
  fairMultiple?: number
  fairYield?: number
  qualityMultiplier: number
  notes: string[]
}

export interface FairValueInput {
  symbol: string
  facts: CompanyFacts
  peers: PeerMedians | null
  moatScore: number
  safetyGateFailed: boolean
  forwardEstimates: ForwardEstimatesSeries | null
  incomeAnnual: JsonRecord[]
  incomeQuarterly: JsonRecord[]
  profileId: FairValueProfileId
}

export interface FairValueResult {
  symbol: string
  profileId: FairValueProfileId
  subProfileId: FairValueSubProfileId
  asOf: string
  marketPrice?: number
  cfv: FairValueBand
  ffv2?: FairValueBand
  upsideToCfvPct?: number
  upsideToFfv2Pct?: number
  cagrToFfv2?: number
  qualityMultiplier: number
  methods: FairValueMethodResult[]
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
}

export interface FairValueSnapshot {
  cfv: FairValueBand
  ffv2?: FairValueBand
  marketPrice?: number
  upsideToCfvPct?: number
  upsideToFfv2Pct?: number
  cagrToFfv2?: number
  profileId: FairValueProfileId
  subProfileId: FairValueSubProfileId
  qualityMultiplier: number
  confidence: 'high' | 'medium' | 'low'
  methods: FairValueMethodResult[]
  warnings: string[]
  asOf: string
}

export interface ForwardYearMetrics {
  fiscalYear: number
  revenueUsd?: number
  eps?: number
  revenueAnalystCount?: number
  epsAnalystCount?: number
}

export interface NormalizedOperatingMetrics {
  revenueTtm: number
  grossProfitTtm?: number
  ebitdaTtm?: number
  ebitTtm?: number
  fcfTtm?: number
  epsTtm?: number
  grossMargin?: number
  ebitdaMargin?: number
  ebitToEbitdaRatio?: number
  fcfToRevenue?: number
  netDebt: number
  shares: number
  enterpriseValue?: number
}

export interface FairValueBuildContext {
  input: FairValueInput
  subProfileId: FairValueSubProfileId
  operating: NormalizedOperatingMetrics
  forwardFy2?: ForwardYearMetrics
  forwardFy1?: ForwardYearMetrics
  qualityMultiplier: number
  qualityNotes: string[]
  warnings: string[]
}

export interface FairValueProfileAdapter {
  id: FairValueProfileId
  classifySubProfile(ctx: FairValueBuildContext): FairValueSubProfileId
  methodWeights(sub: FairValueSubProfileId): Partial<Record<FairValueMethodId, number>>
  computeQualityMultiplier(ctx: FairValueBuildContext): { q: number; notes: string[] }
  normalizeOperatingMetrics(ctx: FairValueBuildContext): NormalizedOperatingMetrics
  adjustForwardMultiple?(
    methodId: FairValueMethodId,
    baseMultiple: number,
    ctx: FairValueBuildContext,
  ): number
  activeMethods(sub: FairValueSubProfileId): FairValueMethodId[]
}

export interface FairValueConfigRoot {
  schema: string
  defaults: {
    peer_weights: { n_gte_8: number; n_gte_5: number; else: number }
    quality: { moat_alpha: number; moat_center: number; moat_min: number; moat_max: number }
    bands: { multiple_swing: number; yield_swing: number; q_swing: number; thin_peers_extra: number }
  }
  profiles: Record<
    FairValueProfileId,
    {
      q_min: number
      q_max: number
      sector_anchors: Record<string, number>
      rule_of_40_beta?: number
      rule_of_40_anchor?: number
      roic_beta?: number
      roic_anchor_pp?: number
      peg_fair?: number
      cyclical?: {
        peak_margin_ratio: number
        trough_margin_ratio: number
        mid_cycle_years: number
        peak_cycle_q: number
        trough_cycle_q: number
        forward_peak_fade: number
      }
      sub_profiles: Record<string, Partial<Record<string, number>>>
    }
  >
}
