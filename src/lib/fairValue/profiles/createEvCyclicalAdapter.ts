import { getProfileConfig } from '../loadFairValueConfig'
import { computeMoatQuality, clampProfileQ } from '../core/qualityMultiplier'
import {
  createStandardAdapter,
  parseMethodWeights,
  computeRoicQuality,
  activeMethodsFromWeights,
} from './configDrivenAdapter'
import {
  detectCyclicalState,
  normalizeSemisOperating,
} from './cyclicalNormalize'
import type {
  FairValueBuildContext,
  FairValueMethodId,
  FairValueProfileId,
  FairValueSubProfileId,
} from '../types'

export function createEvCyclicalAdapter(profileId: FairValueProfileId) {
  const base = createStandardAdapter(profileId, {
    classifySubProfile(ctx) {
      const cyclical = detectCyclicalState(ctx.operating.ebitdaMargin, ctx.input.incomeAnnual, profileId)
      return cyclical.subProfile
    },
    normalizeOperatingMetrics(ctx) {
      const cyclical = detectCyclicalState(ctx.operating.ebitdaMargin, ctx.input.incomeAnnual, profileId)
      return normalizeSemisOperating(ctx.operating, cyclical)
    },
    computeQualityMultiplier(ctx) {
      const { q: qMoat, notes } = computeMoatQuality(ctx.input.moatScore, ctx.input.safetyGateFailed)
      const { qExtra, notes: roicNotes } = computeRoicQuality(ctx, profileId)
      notes.push(...roicNotes)

      const cfg = getProfileConfig(profileId)
      let qCycle = 1
      const sub = detectCyclicalState(ctx.operating.ebitdaMargin, ctx.input.incomeAnnual, profileId).subProfile
      if (sub === 'cyclical_peak' && cfg.cyclical) {
        qCycle = cfg.cyclical.peak_cycle_q
        notes.push('Peak cycle — Q_cycle applied')
      } else if (sub === 'cyclical_trough' && cfg.cyclical) {
        qCycle = cfg.cyclical.trough_cycle_q
        notes.push('Trough cycle — Q_cycle applied')
      }

      const q = clampProfileQ(qMoat * qExtra * qCycle, profileId)
      return { q, notes }
    },
  })

  return {
    ...base,
    adjustForwardMultiple(_methodId: FairValueMethodId, baseMultiple: number, ctx: FairValueBuildContext) {
      const cfg = getProfileConfig(profileId)
      let mult = baseMultiple
      const sub = detectCyclicalState(ctx.operating.ebitdaMargin, ctx.input.incomeAnnual, profileId).subProfile
      if (sub === 'cyclical_peak' && cfg.cyclical) {
        mult *= 1 - cfg.cyclical.forward_peak_fade
      }
      const q = ctx.qualityMultiplier
      const profileCfg = getProfileConfig(profileId)
      mult *= Math.min(1.05, Math.max(0.9, 0.9 + 0.1 * ((q - profileCfg.q_min) / (profileCfg.q_max - profileCfg.q_min + 1e-9))))
      return mult
    },
    activeMethods(sub: FairValueSubProfileId) {
      return activeMethodsFromWeights(parseMethodWeights(profileId, sub))
    },
  }
}

export function cyclicalWarning(sub: FairValueSubProfileId): string | undefined {
  if (sub === 'cyclical_peak') {
    return 'Cyclical peak — fair value uses mid-cycle normalized EBITDA, not trailing peak earnings.'
  }
  if (sub === 'cyclical_trough') {
    return 'Cyclical trough — fair value uses mid-cycle normalized EBITDA.'
  }
  return undefined
}
