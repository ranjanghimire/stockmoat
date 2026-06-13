import { getProfileConfig, methodWeightsFromConfig } from '../loadFairValueConfig'
import { computeMoatQuality, clampProfileQ } from '../core/qualityMultiplier'
import { clamp } from '../core/fairMultiple'
import type {
  FairValueBuildContext,
  FairValueMethodId,
  FairValueProfileAdapter,
  FairValueProfileId,
  FairValueSubProfileId,
} from '../types'

const METHOD_KEY_MAP: Record<string, FairValueMethodId> = {
  ev_gross_profit: 'ev_gross_profit',
  ev_revenue: 'ev_revenue',
  ev_ebitda: 'ev_ebitda',
  ev_ebit: 'ev_ebit',
  fcf_yield_peer: 'fcf_yield_peer',
  fcf_yield_own_5y: 'fcf_yield_own_5y',
  peg_implied_pe: 'peg_implied_pe',
  pe_overlay: 'pe_trailing',
  price_to_book: 'price_to_book',
  price_to_tangible_book: 'price_to_tangible_book',
  p_ffo: 'p_ffo',
}

export function parseMethodWeights(
  profileId: FairValueProfileId,
  sub: FairValueSubProfileId,
): Partial<Record<FairValueMethodId, number>> {
  const raw = methodWeightsFromConfig(profileId, sub === 'standard' ? undefined : sub)
  const out: Partial<Record<FairValueMethodId, number>> = {}
  for (const [k, v] of Object.entries(raw)) {
    const id = METHOD_KEY_MAP[k]
    if (id !== undefined && v !== undefined) out[id] = v
  }
  return out
}

export function computeRoicQuality(ctx: FairValueBuildContext, profileId: FairValueProfileId): { qExtra: number; notes: string[] } {
  const cfg = getProfileConfig(profileId)
  const notes: string[] = []
  let qExtra = 1
  const beta = cfg.roic_beta ?? 0.15
  const anchor = cfg.roic_anchor_pp ?? 0.05
  const roic = ctx.input.facts.roic
  const peerRoic = ctx.input.peers?.roic
  if (roic !== undefined && peerRoic !== undefined) {
    qExtra = 1 + beta * ((roic - peerRoic) / anchor)
    qExtra = clamp(qExtra, 0.9, 1.15)
    notes.push(`ROIC vs peer → Q ${qExtra.toFixed(3)}`)
  }
  return { qExtra, notes }
}

export function computeRoeQuality(ctx: FairValueBuildContext, profileId: FairValueProfileId): { qExtra: number; notes: string[] } {
  const cfg = getProfileConfig(profileId)
  const notes: string[] = []
  let qExtra = 1
  const beta = cfg.roe_beta ?? 0.12
  const roe = ctx.input.facts.roe
  const peerRoe = ctx.input.peers?.roe
  if (roe !== undefined && peerRoe !== undefined) {
    qExtra = 1 + beta * ((roe - peerRoe) / 0.05)
    qExtra = clamp(qExtra, 0.9, 1.15)
    notes.push(`ROE vs peer → Q ${qExtra.toFixed(3)}`)
  }
  return { qExtra, notes }
}

export function buildStandardQuality(ctx: FairValueBuildContext, profileId: FairValueProfileId): { q: number; notes: string[] } {
  const { q: qMoat, notes } = computeMoatQuality(ctx.input.moatScore, ctx.input.safetyGateFailed)
  const { qExtra, notes: roicNotes } = computeRoicQuality(ctx, profileId)
  notes.push(...roicNotes)
  const q = clampProfileQ(qMoat * qExtra, profileId)
  return { q, notes }
}

export function activeMethodsFromWeights(weights: Partial<Record<FairValueMethodId, number>>): FairValueMethodId[] {
  return (Object.keys(weights) as FairValueMethodId[]).filter((k) => (weights[k] ?? 0) > 0)
}

export function createStandardAdapter(
  profileId: FairValueProfileId,
  opts: {
    classifySubProfile?: (ctx: FairValueBuildContext) => FairValueSubProfileId
    normalizeOperatingMetrics?: (ctx: FairValueBuildContext) => import('../types').NormalizedOperatingMetrics
    computeQualityMultiplier?: (ctx: FairValueBuildContext) => { q: number; notes: string[] }
  } = {},
): FairValueProfileAdapter {
  return {
    id: profileId,
    classifySubProfile(ctx) {
      return opts.classifySubProfile?.(ctx) ?? 'standard'
    },
    methodWeights(sub) {
      return parseMethodWeights(profileId, sub)
    },
    computeQualityMultiplier(ctx) {
      return opts.computeQualityMultiplier?.(ctx) ?? buildStandardQuality(ctx, profileId)
    },
    normalizeOperatingMetrics(ctx) {
      return opts.normalizeOperatingMetrics?.(ctx) ?? ctx.operating
    },
    activeMethods(sub) {
      return activeMethodsFromWeights(parseMethodWeights(profileId, sub))
    },
  }
}
