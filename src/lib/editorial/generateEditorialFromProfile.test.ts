import { describe, expect, it } from 'vitest'
import { generateEditorialFromProfile } from './generateEditorialFromProfile'

describe('generateEditorialFromProfile', () => {
  it('produces three non-empty paragraphs', () => {
    const g = generateEditorialFromProfile({
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      sector: 'Technology',
      industry: 'Consumer Electronics',
      description:
        'Apple Inc. designs, manufactures, and markets smartphones worldwide. The company partners with suppliers and developers across its ecosystem.',
    })
    expect(g.moatBody).toContain('Apple Inc. (AAPL)')
    expect(g.howTheyMakeMoneyBody).toContain('makes money')
    expect(g.recentDealsBody.length).toBeGreaterThan(40)
  })

  it('admits no moat for clinical-stage biotech', () => {
    const g = generateEditorialFromProfile({
      symbol: 'TST',
      companyName: 'Test Biotech',
      sector: 'Healthcare',
      industry: 'Biotechnology',
      description:
        'Clinical-stage company developing novel therapies. Revenue is immaterial and the company is pre-revenue from product sales.',
      mktCapUsd: 50_000_000,
    })
    expect(g.moatBody.toLowerCase()).toContain('does not currently have a clear competitive moat')
    expect(g.recentDealsBody.toLowerCase()).not.toContain('best tracked through investor')
  })
})
