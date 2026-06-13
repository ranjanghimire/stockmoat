import { getProfileConfig } from '../loadFairValueConfig'
import { computeMoatQuality, clampProfileQ } from '../core/qualityMultiplier'
import { clamp } from '../core/fairMultiple'
import {
  detectCyclicalState,
  normalizeSemisOperating,
} from './cyclicalNormalize'
import type {
  FairValueBuildContext,
  FairValueMethodId,
  FairValueProfileAdapter,
  FairValueSubProfileId,
  NormalizedOperatingMetrics,
} from '../types'

function cfg() {
  return getProfileConfig('semis_hardware')
}

function weightsFromConfig(sub: FairValueSubProfileId): Partial<Record<FairValueMethodId, number>> {
  const subCfg = cfg().sub_profiles?.[sub]
  if (!subCfg) return {}
  const map: Partial<Record<FairValueMethodId, number>> = {}
  if (subCfg.ev_ebitda !== undefined) map.ev_ebitda = subCfg.ev_ebitda
  if (subCfg.ev_ebit !== undefined) map.ev_ebit = subCfg.ev_ebit
  if (subCfg.fcf_yield_peer !== undefined) map.fcf_yield_peer = subCfg.fcf_yield_peer
  if (subCfg.peg_implied_pe !== undefined) map.peg_implied_pe = subCfg.peg_implied_pe
  return map
}

export const semisHardwareAdapter: FairValueProfileAdapter = {
  id: 'semis_hardware',

  classifySubProfile(ctx: FairValueBuildContext): FairValueSubProfileId {
    const cyclical = detectCyclicalState(ctx.operating.ebitdaMargin, ctx.input.incomeAnnual, 'semis_hardware')
    return cyclical.subProfile
  },

  methodWeights(sub: FairValueSubProfileId) {
    if (sub === 'insufficient') return {}
    return weightsFromConfig(sub)
  },

  computeQualityMultiplier(ctx: FairValueBuildContext) {
    const { q: qMoat, notes } = computeMoatQuality(ctx.input.moatScore, ctx.input.safetyGateFailed)
    const profileCfg = cfg()

    let qRoic = 1
    const roic = ctx.input.facts.roic
    const peerRoic = ctx.input.peers?.roic
    if (roic !== undefined && peerRoic !== undefined) {
      const delta = roic - peerRoic
      qRoic = 1 + profileCfg.roic_beta! * (delta / profileCfg.roic_anchor_pp!)
      qRoic = clamp(qRoic, 0.9, 1.15)
      notes.push(`ROIC vs peer → Q_roic ${qRoic.toFixed(3)}`)
    }

    let qCycle = 1
    const cyclical = detectCyclicalState(ctx.operating.ebitdaMargin, ctx.input.incomeAnnual, 'semis_hardware')
    if (cyclical.subProfile === 'cyclical_peak') {
      qCycle = profileCfg.cyclical!.peak_cycle_q
      notes.push('Peak cycle — Q_cycle 0.92')
    } else if (cyclical.subProfile === 'cyclical_trough') {
      qCycle = profileCfg.cyclical!.trough_cycle_q
      notes.push('Trough cycle — Q_cycle 1.05')
    }

    const q = clampProfileQ(qMoat * qRoic * qCycle, 'semis_hardware')
    return { q, notes }
  },

  normalizeOperatingMetrics(ctx: FairValueBuildContext): NormalizedOperatingMetrics {
    const cyclical = detectCyclicalState(ctx.operating.ebitdaMargin, ctx.input.incomeAnnual, 'semis_hardware')
    return normalizeSemisOperating(ctx.operating, cyclical)
  },

  adjustForwardMultiple(_methodId: FairValueMethodId, baseMultiple: number, ctx: FairValueBuildContext): number {
    const cyclical = detectCyclicalState(ctx.operating.ebitdaMargin, ctx.input.incomeAnnual, 'semis_hardware')
    let mult = baseMultiple
    if (cyclical.subProfile === 'cyclical_peak') {
      mult *= 1 - cfg().cyclical!.forward_peak_fade
    }
    const q = ctx.qualityMultiplier
    mult *= clamp(0.9 + 0.1 * ((q - 0.75) / 0.5), 0.9, 1.05)
    return mult
  },

  activeMethods(sub: FairValueSubProfileId): FairValueMethodId[] {
    if (sub.startsWith('cyclical_')) {
      return ['ev_ebitda', 'ev_ebit', 'fcf_yield_peer', 'peg_implied_pe']
    }
    return []
  },
}

export function cyclicalWarning(sub: FairValueSubProfileId): string | undefined {
  if (sub === 'cyclical_peak') {
    return 'Semiconductor at cyclical peak — fair value uses mid-cycle normalized EBITDA, not trailing peak earnings.'
  }
  if (sub === 'cyclical_trough') {
    return 'Semiconductor at cyclical trough — fair value uses mid-cycle normalized EBITDA.'
  }
  return undefined
}
