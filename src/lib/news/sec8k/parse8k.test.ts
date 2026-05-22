import { describe, expect, it } from 'vitest'
import { build8kHeadline, parse8kDocument } from './parse8k'

const SAMPLE = `
<html><body>
<p>UNITED STATES SECURITIES AND EXCHANGE COMMISSION</p>
<h1>FORM 8-K</h1>
<p>Item 1.01 Entry into a Material Definitive Agreement</p>
<p>On May 1, 2026, Example Corp entered into a multi-year supply agreement valued at approximately $2.5 billion.</p>
<p>Item 2.02 Results of Operations and Financial Condition</p>
<p>On May 1, 2026, the Company reported Q1 revenue.</p>
<p>Item 8.01 Other Events</p>
<p>The Company announced a strategic partnership with a national government agency.</p>
</body></html>
`

describe('parse8kDocument', () => {
  it('extracts material items and skips routine 2.02', () => {
    const parsed = parse8kDocument(SAMPLE)
    const codes = parsed.items.map((i) => i.code)
    expect(codes).toContain('1.01')
    expect(codes).toContain('8.01')
    expect(codes).not.toContain('2.02')
  })

  it('builds readable headline', () => {
    const parsed = parse8kDocument(SAMPLE)
    const h = build8kHeadline('NVDA', parsed.items)
    expect(h).toMatch(/NVDA/)
    expect(h).toMatch(/8-K/)
  })
})
