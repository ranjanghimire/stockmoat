import type { CompanyFacts } from '../fmp/buildCompanyFacts'
import type { PeerMedians } from '../fmp/peerMedians'
import type { ForwardEstimatesSeries } from '../fmp/parseForwardEstimates'
import type { JsonRecord } from '../fmp/normalize'

/** Moat profile ids + IT variant keys used in fair_value config. */
export type FairValueProfileId =
  | 'software_saas'
  | 'semis_hardware'
  | 'consumer_staples_discretionary_general'
  | 'healthcare_pharma_medtech_services_tools'
  | 'industrials_machinery_aerospace_transportation_construction'
  | 'capital_markets_brokers_asset_managers'
  | 'utilities_electric_gas_water'
  | 'materials_mining_chemicals_paper_packaging'
  | 'energy_exploration_production'
  | 'energy_midstream_integrated_refining'
  | 'banks_thrifts'
  | 'insurance_general'
  | 'reits'

export type FairValueTemplateId =
  | 'software_saas'
  | 'semis_hardware'
  | 'ev_general'
  | 'ev_cyclical'
  | 'financials_bank'
  | 'financials_insurance'
  | 'reit_ffo'

export type FairValueSubProfileId =
  | 'profitable_saas'
  | 'growth_saas'
  | 'transitional_saas'
  | 'semis_mid_cycle'
  | 'semis_peak_cycle'
  | 'semis_trough_cycle'
  | 'cyclical_mid'
  | 'cyclical_peak'
  | 'cyclical_trough'
  | 'standard'
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
  | 'price_to_book'
  | 'price_to_tangible_book'
  | 'p_ffo'

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
  bookValuePerShare?: number
  tangibleBookPerShare?: number
  ffoPerShare?: number
  netDebt: number
  shares: number
  enterpriseValue?: number
}

export interface FairValueBuildContext {
  input: FairValueInput
  subProfileId: FairValueSubProfileId
  operating: NormalizedOperatingMetrics
  forwardFy1?: ForwardYearMetrics
  forwardFy2?: ForwardYearMetrics
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

export interface FairValueProfileConfig {
  template?: FairValueTemplateId
  q_min: number
  q_max: number
  sector_anchors: Record<string, number>
  methods?: Partial<Record<string, number>>
  rule_of_40_beta?: number
  rule_of_40_anchor?: number
  roic_beta?: number
  roe_beta?: number
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
  sub_profiles?: Record<string, Partial<Record<string, number>>>
}

export interface FairValueConfigRoot {
  schema: string
  defaults: {
    peer_weights: { n_gte_8: number; n_gte_5: number; else: number }
    quality: { moat_alpha: number; moat_center: number; moat_min: number; moat_max: number }
    bands: { multiple_swing: number; yield_swing: number; q_swing: number; thin_peers_extra: number }
  }
  profiles: Partial<Record<FairValueProfileId, FairValueProfileConfig>>
}

export const SUPPORTED_FAIR_VALUE_PROFILES: readonly FairValueProfileId[] = [
  'software_saas',
  'semis_hardware',
  'consumer_staples_discretionary_general',
  'healthcare_pharma_medtech_services_tools',
  'industrials_machinery_aerospace_transportation_construction',
  'capital_markets_brokers_asset_managers',
  'utilities_electric_gas_water',
  'materials_mining_chemicals_paper_packaging',
  'energy_exploration_production',
  'energy_midstream_integrated_refining',
  'banks_thrifts',
  'insurance_general',
  'reits',
] as const
