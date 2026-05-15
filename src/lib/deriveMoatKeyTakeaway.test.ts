import { describe, expect, it } from 'vitest'
import type { MoatAnalysis } from './computeMoatAnalysis'
import { companyNameWithTicker, deriveMoatKeyTakeaway } from './deriveMoatKeyTakeaway'

function baseAnalysis(overrides: Partial<MoatAnalysis> = {}): MoatAnalysis {
  return {
    ticker: 'ACME',
    displayName: 'Acme Co',
    profileId: 'consumer_staples_discretionary_general',
    score: 6,
    rawWeighted: 0.55,
    anyGateFail: false,
    scoreCap: 6,
    metrics: [],
    pillars: [],
    dataSource: 'fmp',
    ...overrides,
  }
}

describe('companyNameWithTicker', () => {
  it('combines display name and ticker', () => {
    expect(companyNameWithTicker('Microsoft', 'MSFT')).toBe('Microsoft (MSFT)')
  })
  it('returns ticker only when display name matches symbol', () => {
    expect(companyNameWithTicker('MSFT', 'MSFT')).toBe('MSFT')
    expect(companyNameWithTicker('msft', 'MSFT')).toBe('MSFT')
  })
  it('returns ticker when display name is empty', () => {
    expect(companyNameWithTicker('', 'AAPL')).toBe('AAPL')
    expect(companyNameWithTicker(undefined, 'AAPL')).toBe('AAPL')
  })
})

describe('deriveMoatKeyTakeaway', () => {
  it('returns neutral when fundamentals are missing', () => {
    const r = deriveMoatKeyTakeaway(baseAnalysis({ fundamentals: undefined }))
    expect(r.primary?.id).toBe('no_fundamentals')
    expect(r.primary?.tone).toBe('neutral')
    expect(r.primary?.text).toContain('Acme Co (ACME)')
  })

  it('flags severe balance sheet stress when liabilities exceed assets', () => {
    const r = deriveMoatKeyTakeaway(
      baseAnalysis({
        fundamentals: {
          netIncomeTtmUsd: 100e6,
          balanceCharts: {
            yearly: [
              {
                date: '2022-12-31',
                label: '2022',
                totalAssets: 100e6,
                totalLiabilities: 80e6,
              },
              {
                date: '2023-12-31',
                label: '2023',
                totalAssets: 90e6,
                totalLiabilities: 100e6,
              },
            ],
            quarterly: [],
          },
        },
      }),
    )
    expect(r.primary?.id).toBe('balance_sheet_stress')
    expect(r.primary?.text).toContain('severe balance sheet stress')
    expect(r.primary?.text).toContain('Acme Co (ACME)')
    expect(r.primary?.text).not.toContain('bankruptcy')
  })

  it('describes TTM losses with unsigned magnitude', () => {
    const r = deriveMoatKeyTakeaway(
      baseAnalysis({
        fundamentals: {
          netIncomeTtmUsd: -1.5e9,
          incomeCharts: { yearly: [], quarterly: [] },
        },
      }),
    )
    expect(r.primary?.id).toBe('ni_loss_ttm')
    expect(r.primary?.text).toContain('Acme Co (ACME)')
    expect(r.primary?.text).toContain('lost about')
    expect(r.primary?.text).toContain('$1.50B')
    expect(r.primary?.text).not.toContain('lost about -$')
  })

  it('describes TTM profit', () => {
    const r = deriveMoatKeyTakeaway(
      baseAnalysis({
        fundamentals: {
          netIncomeTtmUsd: 72e9,
          freeCashFlowTtmUsd: 70e9,
          incomeCharts: { yearly: [], quarterly: [] },
        },
      }),
    )
    expect(r.primary?.id).toBe('ni_profit_ttm')
    expect(r.primary?.text).toContain('Acme Co (ACME)')
    expect(r.primary?.text).toContain('earned about')
    expect(r.primary?.text).toContain('$72.00B')
  })

  it('prioritizes weak cash conversion when TTM profit is large', () => {
    const r = deriveMoatKeyTakeaway(
      baseAnalysis({
        fundamentals: {
          netIncomeTtmUsd: 20e9,
          freeCashFlowTtmUsd: -500e6,
          incomeCharts: { yearly: [], quarterly: [] },
        },
      }),
    )
    expect(r.primary?.id).toBe('fcf_negative_vs_profit')
    expect(r.primary?.text).toContain('Acme Co (ACME)')
  })

  it('adds gate failure as secondary on profitable TTM', () => {
    const r = deriveMoatKeyTakeaway(
      baseAnalysis({
        anyGateFail: true,
        fundamentals: {
          netIncomeTtmUsd: 10e9,
          freeCashFlowTtmUsd: 9e9,
          incomeCharts: { yearly: [], quarterly: [] },
        },
      }),
    )
    expect(r.primary?.id).toBe('ni_profit_ttm')
    expect(r.secondary?.id).toBe('gate_fail_profit')
  })
})
