import type { CompanyFacts } from '../../fmp/buildCompanyFacts'

/** Cap PEG growth so one-off EPS base effects (e.g. ADR/split mismatch) cannot dominate CFV. */
export const MAX_PEG_GROWTH_PCT = 50
export const MIN_PEG_GROWTH_PCT = 3

export function resolvePegGrowthPercent(facts: CompanyFacts): number | undefined {
  let growth = facts.epsGrowthPercent

  if (growth === undefined && facts.annualEps.length >= 2) {
    const e0 = facts.annualEps[0]!
    const e1 = facts.annualEps[1]!
    if (e0 > 0 && e1 > 0 && e0 > e1) {
      growth = ((e0 - e1) / e1) * 100
    }
  }

  if (
    growth === undefined &&
    facts.peTrailing !== undefined &&
    facts.peTrailing > 0 &&
    facts.pegRatio !== undefined &&
    facts.pegRatio >= 0.35 &&
    facts.pegRatio <= 3.5
  ) {
    growth = facts.peTrailing / facts.pegRatio
  }

  if (growth === undefined || growth < MIN_PEG_GROWTH_PCT) return undefined
  return Math.min(growth, MAX_PEG_GROWTH_PCT)
}
