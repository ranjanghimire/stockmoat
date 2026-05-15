import { describe, expect, it } from 'vitest'
import { isGenericRecentDealsFiller } from './recentDealsOverrides'

describe('isGenericRecentDealsFiller', () => {
  it('flags legacy IR / automated-summary boilerplate', () => {
    const amdish =
      "Advanced Micro Devices, Inc. (AMD)'s recent deals and partnerships are best tracked through investor relations and SEC filings; this automated summary highlights Semiconductors positioning in Technology while specific alliance headlines should be refreshed periodically."
    expect(isGenericRecentDealsFiller(amdish)).toBe(true)
  })

  it('does not flag specific partnership copy', () => {
    expect(
      isGenericRecentDealsFiller(
        'ACME (ACME) announced a strategic supply agreement with Example Corp for widget manufacturing in its latest 10-Q.',
      ),
    ).toBe(false)
  })
})
