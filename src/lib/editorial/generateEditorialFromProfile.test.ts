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
})
