import type { JsonRecord } from '../../fmp/normalize'
import { extractEbitdaFromIncome, medianOf } from '../buildContext'
import { clamp } from '../core/fairMultiple'
import { getProfileConfig } from '../loadFairValueConfig'
import type { FairValueProfileId, FairValueSubProfileId, NormalizedOperatingMetrics } from '../types'

export interface CyclicalState {
  subProfile: FairValueSubProfileId
  ebitdaMarginTtm?: number
  ebitdaMargin5y?: number
  marginRatio?: number
}

export function annualEbitdaMargins(incomeAnnual: JsonRecord[], maxYears: number): number[] {
  const margins: number[] = []
  for (let i = 0; i < Math.min(maxYears, incomeAnnual.length); i++) {
    const row = incomeAnnual[i]!
    const rev = row.revenue ?? row.totalRevenue ?? row.sales
    const revN = typeof rev === 'number' ? rev : undefined
    const ebitda = extractEbitdaFromIncome(row)
    if (revN !== undefined && revN > 0 && ebitda !== undefined) {
      margins.push(ebitda / revN)
    }
  }
  return margins
}

export function detectCyclicalState(
  ebitdaMarginTtm: number | undefined,
  incomeAnnual: JsonRecord[],
  profileId: FairValueProfileId = 'semis_hardware',
): CyclicalState {
  const cfg = getProfileConfig(profileId).cyclical ?? getProfileConfig('semis_hardware').cyclical!
  const margins = annualEbitdaMargins(incomeAnnual, cfg.mid_cycle_years)
  const m5 = medianOf(margins)

  if (ebitdaMarginTtm === undefined || m5 === undefined || m5 <= 0) {
    return { subProfile: 'cyclical_mid', ebitdaMarginTtm, ebitdaMargin5y: m5 }
  }

  const ratio = ebitdaMarginTtm / m5
  let subProfile: FairValueSubProfileId = 'cyclical_mid'
  if (ratio > cfg.peak_margin_ratio) subProfile = 'cyclical_peak'
  else if (ratio < cfg.trough_margin_ratio || ebitdaMarginTtm <= 0) subProfile = 'cyclical_trough'

  return { subProfile, ebitdaMarginTtm, ebitdaMargin5y: m5, marginRatio: ratio }
}

export function normalizeSemisOperating(
  operating: NormalizedOperatingMetrics,
  cyclical: CyclicalState,
): NormalizedOperatingMetrics {
  const { subProfile, ebitdaMargin5y, ebitdaMarginTtm } = cyclical
  if (subProfile === 'cyclical_mid' || ebitdaMargin5y === undefined) {
    return operating
  }

  const rev = operating.revenueTtm
  const ebitdaNorm = rev * ebitdaMargin5y
  let ebitNorm = operating.ebitTtm
  if (operating.ebitdaTtm !== undefined && operating.ebitdaTtm > 0 && operating.ebitTtm !== undefined) {
    ebitNorm = ebitdaNorm * (operating.ebitTtm / operating.ebitdaTtm)
  }

  let epsNorm = operating.epsTtm
  if (epsNorm !== undefined && ebitdaMarginTtm !== undefined && ebitdaMarginTtm > 0) {
    const ratio = clamp(ebitdaMargin5y / ebitdaMarginTtm, 0.5, 2.0)
    epsNorm = epsNorm * ratio
  }

  return {
    ...operating,
    ebitdaTtm: ebitdaNorm,
    ebitTtm: ebitNorm,
    epsTtm: epsNorm,
    ebitdaMargin: ebitdaMargin5y,
  }
}
