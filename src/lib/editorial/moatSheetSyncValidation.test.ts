import { describe, expect, it } from 'vitest'
import { validateMoatSheetUpsert } from './moatSheetSyncValidation'

describe('validateMoatSheetUpsert', () => {
  it('accepts solid triple', () => {
    const r = validateMoatSheetUpsert({
      body:
        'ACN’s moat comes from global scale in consulting and outsourcing, deep client relationships, and repeatable delivery IP that embeds in large enterprises.',
      how_they_make_money_body:
        'Accenture earns fees by advising on strategy and technology, implementing large transformation programs, and running managed services and outsourcing contracts.',
      recent_deals_body:
        'Accenture has publicly highlighted material AI partnerships and multi-year programs with major technology vendors and clients; specifics vary by quarter in earnings materials.',
    })
    expect(r).toEqual({ ok: true })
  })

  it('rejects short moat', () => {
    const r = validateMoatSheetUpsert({
      body: 'Too short',
      how_they_make_money_body: null,
      recent_deals_body: null,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects IR filler in deals', () => {
    const r = validateMoatSheetUpsert({
      body:
        'X’s moat comes from scale and execution in its industry with durable customer relationships and operational efficiency across its core markets worldwide.',
      how_they_make_money_body:
        'X makes money by selling products and services to enterprise and consumer customers through direct and partner channels with recurring and transactional revenue.',
      recent_deals_body:
        "Foo (FOO)'s recent deals are best tracked through investor relations and SEC filings; this automated summary highlights positioning while alliance headlines should be refreshed periodically.",
    })
    expect(r.ok).toBe(false)
  })
})
