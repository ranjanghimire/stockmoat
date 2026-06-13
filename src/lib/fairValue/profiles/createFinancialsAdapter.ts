import { createStandardAdapter, computeRoeQuality } from './configDrivenAdapter'
import { computeMoatQuality, clampProfileQ } from '../core/qualityMultiplier'
import type { FairValueProfileId } from '../types'

export function createFinancialsBankAdapter(profileId: FairValueProfileId = 'banks_thrifts') {
  return createStandardAdapter(profileId, {
    computeQualityMultiplier(ctx) {
      const { q: qMoat, notes } = computeMoatQuality(ctx.input.moatScore, ctx.input.safetyGateFailed)
      const { qExtra, notes: roeNotes } = computeRoeQuality(ctx, profileId)
      notes.push(...roeNotes)
      return { q: clampProfileQ(qMoat * qExtra, profileId), notes }
    },
  })
}

export function createFinancialsInsuranceAdapter(profileId: FairValueProfileId = 'insurance_general') {
  return createFinancialsBankAdapter(profileId)
}
