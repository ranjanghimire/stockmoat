import { describe, expect, it } from 'vitest'
import { shouldRejectCandidate } from './prefilter'

describe('shouldRejectCandidate', () => {
  it('rejects price-action fluff', () => {
    const r = shouldRejectCandidate(
      'Shares rise 3% on analyst upgrade',
      'Stock trading higher after price target raised',
      new Date(),
    )
    expect(r).toBe('price_action')
  })

  it('keeps material M&A headline', () => {
    const r = shouldRejectCandidate(
      'Company to acquire rival in $12 billion deal',
      'Definitive merger agreement signed',
      new Date(),
    )
    expect(r).toBeNull()
  })

  it('rejects routine earnings recap', () => {
    const r = shouldRejectCandidate('Q1 earnings beat estimates', 'EPS beat', new Date())
    expect(r).toBe('routine_earnings')
  })
})
