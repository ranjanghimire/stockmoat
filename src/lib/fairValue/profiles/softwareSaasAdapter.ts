import { loadFairValueConfig } from '../loadFairValueConfig'
import { computeMoatQuality, clampProfileQ } from '../core/qualityMultiplier'
import { ruleOf40Approx } from '../ruleOf40'
import { clamp } from '../core/fairMultiple'
import type {
  FairValueBuildContext,
  FairValueMethodId,
  FairValueProfileAdapter,
  FairValueSubProfileId,
  NormalizedOperatingMetrics,
} from '../types'

function cfg() {
  return loadFairValueConfig().profiles.software_saas
}

function classifySaasSubProfile(operating: NormalizedOperatingMetrics, facts: FairValueBuildContext['input']['facts']): FairValueSubProfileId {
  const fcf = operating.fcfTtm
  const fcfYield = facts.fcfYield
  const opMargin = facts.operatingMargin

  if (
    fcf !== undefined &&
    fcf > 0 &&
    fcfYield !== undefined &&
    fcfYield > 0 &&
    opMargin !== undefined &&
    opMargin > 0
  ) {
    return 'profitable_saas'
  }
  if (operating.revenueTtm > 0 && (opMargin === undefined || opMargin < 0 || fcf === undefined || fcf <= 0)) {
    return 'growth_saas'
  }
  if (operating.grossProfitTtm !== undefined && operating.grossProfitTtm > 0) {
    return 'transitional_saas'
  }
  return 'insufficient'
}

function weightsFromConfig(sub: FairValueSubProfileId): Partial<Record<FairValueMethodId, number>> {
  const subCfg = cfg().sub_profiles[sub]
  if (!subCfg) return {}
  const map: Partial<Record<FairValueMethodId, number>> = {}
  if (subCfg.ev_gross_profit !== undefined) map.ev_gross_profit = subCfg.ev_gross_profit
  if (subCfg.ev_revenue !== undefined) map.ev_revenue = subCfg.ev_revenue
  if (subCfg.fcf_yield_peer !== undefined) map.fcf_yield_peer = subCfg.fcf_yield_peer
  if (subCfg.fcf_yield_own_5y !== undefined) map.fcf_yield_own_5y = subCfg.fcf_yield_own_5y
  if (subCfg.pe_overlay !== undefined) map.pe_trailing = subCfg.pe_overlay
  return map
}

export const softwareSaasAdapter: FairValueProfileAdapter = {
  id: 'software_saas',

  classifySubProfile(ctx: FairValueBuildContext): FairValueSubProfileId {
    return classifySaasSubProfile(ctx.operating, ctx.input.facts)
  },

  methodWeights(sub: FairValueSubProfileId) {
    if (sub === 'insufficient') return {}
    return weightsFromConfig(sub)
  },

  computeQualityMultiplier(ctx: FairValueBuildContext) {
    const { q: qMoat, notes } = computeMoatQuality(ctx.input.moatScore, ctx.input.safetyGateFailed)
    const profileCfg = cfg()
    const r40 = ruleOf40Approx(ctx.input.facts)
    let qR40 = 1
    if (r40 !== undefined) {
      qR40 = 1 + profileCfg.rule_of_40_beta! * ((r40 - profileCfg.rule_of_40_anchor!) / 30)
      qR40 = clamp(qR40, 0.9, 1.15)
      notes.push(`Rule of 40 ${r40.toFixed(1)}% → Q_r40 ${qR40.toFixed(3)}`)
    }
    const q = clampProfileQ(qMoat * qR40, 'software_saas')
    return { q, notes }
  },

  normalizeOperatingMetrics(ctx: FairValueBuildContext): NormalizedOperatingMetrics {
    return ctx.operating
  },

  adjustForwardMultiple(methodId: FairValueMethodId, baseMultiple: number, ctx: FairValueBuildContext): number {
    if (methodId !== 'ev_revenue' && methodId !== 'ev_gross_profit') return baseMultiple
    const rev = ctx.input.facts.annualRevenue
    if (rev.length < 2 || ctx.forwardFy2?.revenueUsd === undefined) return baseMultiple
    const g2y = Math.pow(ctx.forwardFy2.revenueUsd / ctx.operating.revenueTtm, 0.5) - 1
    const gTtm =
      rev[1]! > 0 ? (rev[0]! - rev[1]!) / rev[1]! : undefined
    if (gTtm === undefined || gTtm <= 0) return baseMultiple
    const fade = clamp(0.85 + 0.15 * (g2y / gTtm), 0.85, 1.1)
    return baseMultiple * fade
  },

  activeMethods(sub: FairValueSubProfileId): FairValueMethodId[] {
    if (sub === 'profitable_saas') {
      return ['ev_gross_profit', 'ev_revenue', 'fcf_yield_peer', 'fcf_yield_own_5y']
    }
    if (sub === 'growth_saas') {
      return ['ev_gross_profit', 'ev_revenue']
    }
    if (sub === 'transitional_saas') {
      return ['ev_gross_profit', 'ev_revenue', 'fcf_yield_peer', 'fcf_yield_own_5y']
    }
    return []
  },
}
