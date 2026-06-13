import type { CompanyFacts } from '../fmp/buildCompanyFacts'

/** Rule of 40 ≈ YoY revenue growth % + operating margin % (SaaS heuristic). */
export function ruleOf40Approx(facts: CompanyFacts): number | undefined {
  const rev = facts.annualRevenue
  if (rev.length < 2) return undefined
  const r0 = rev[0]
  const r1 = rev[1]
  if (r0 === undefined || r1 === undefined || Math.abs(r1) < 1e-9) return undefined
  const growth = ((r0 - r1) / Math.abs(r1)) * 100
  const marginPct = (facts.operatingMargin ?? 0) * 100
  return growth + marginPct
}
