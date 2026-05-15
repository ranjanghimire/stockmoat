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

  it('detects GPU / compute + agreement language without “strategic partnership” phrasing', () => {
    const g = generateEditorialFromProfile({
      symbol: 'TST',
      companyName: 'Test Miner Compute',
      sector: 'Technology',
      industry: 'Software',
      description:
        'The company operates data centers and bitcoin mining sites. It secured a multi-year agreement with cloud partners to deploy high-density GPU clusters and added several new AI-compute customers through a dedicated compute division while expanding capacity in Texas.',
    })
    expect(g.recentDealsBody.toLowerCase()).toContain('public disclosures')
    expect(g.recentDealsBody.toLowerCase()).not.toContain('has not publicly announced material partnerships')
  })
})
