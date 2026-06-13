import { describe, expect, it } from 'vitest'
import { annualEbitdaMargins, detectCyclicalState, normalizeSemisOperating } from './cyclicalNormalize'

describe('cyclicalNormalize', () => {
  it('detects peak cycle when TTM margin exceeds 5Y median by 20%+', () => {
    const income = [
      { revenue: 40e9, ebitda: 16e9, operatingIncome: 14e9 },
      { revenue: 35e9, ebitda: 9e9, operatingIncome: 8e9 },
      { revenue: 32e9, ebitda: 8e9, operatingIncome: 7e9 },
      { revenue: 30e9, ebitda: 7.5e9, operatingIncome: 6.5e9 },
      { revenue: 28e9, ebitda: 7e9, operatingIncome: 6e9 },
    ]
    const margins = annualEbitdaMargins(income, 5)
    expect(margins.length).toBeGreaterThanOrEqual(4)
    const state = detectCyclicalState(0.4, income)
    expect(state.subProfile).toBe('semis_peak_cycle')
  })

  it('normalizes peak EBITDA down to mid-cycle margin', () => {
    const operating = {
      revenueTtm: 40e9,
      ebitdaTtm: 16e9,
      ebitTtm: 14e9,
      epsTtm: 5,
      ebitdaMargin: 0.4,
      netDebt: 8e9,
      shares: 2e9,
    }
    const cyclical = {
      subProfile: 'semis_peak_cycle' as const,
      ebitdaMarginTtm: 0.4,
      ebitdaMargin5y: 0.28,
      marginRatio: 1.43,
    }
    const norm = normalizeSemisOperating(operating, cyclical)
    expect(norm.ebitdaTtm).toBeCloseTo(40e9 * 0.28, -6)
    expect(norm.ebitdaTtm!).toBeLessThan(operating.ebitdaTtm!)
  })
})
