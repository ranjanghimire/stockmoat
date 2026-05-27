import type { ForwardEstimatesSeries } from '../fmp/parseForwardEstimates'

export interface ForwardCompareRow {
  fiscalYear: number
  metric: 'revenue' | 'eps'
  fmp?: number
  gemini?: number
  pctDiff?: number
}

export function compareForwardSeries(
  fmp: ForwardEstimatesSeries,
  gemini: ForwardEstimatesSeries,
): ForwardCompareRow[] {
  const rows: ForwardCompareRow[] = []

  const geminiRev = new Map(gemini.revenue.map((p) => [p.fiscalYear, p.revenueUsd]))
  for (const p of fmp.revenue) {
    const g = geminiRev.get(p.fiscalYear)
    const pctDiff =
      g !== undefined && p.revenueUsd !== undefined && g > 0
        ? ((p.revenueUsd - g) / g) * 100
        : undefined
    rows.push({ fiscalYear: p.fiscalYear, metric: 'revenue', fmp: p.revenueUsd, gemini: g, pctDiff })
  }

  const geminiEps = new Map(gemini.eps.map((p) => [p.fiscalYear, p.eps]))
  for (const p of fmp.eps) {
    const g = geminiEps.get(p.fiscalYear)
    const pctDiff =
      g !== undefined && p.eps !== undefined && g > 0 ? ((p.eps - g) / g) * 100 : undefined
    rows.push({ fiscalYear: p.fiscalYear, metric: 'eps', fmp: p.eps, gemini: g, pctDiff })
  }

  return rows
}

export function summarizeCompare(rows: ForwardCompareRow[]): {
  revenueMatches: number
  epsMatches: number
  revenueCompared: number
  epsCompared: number
  maxAbsPctDiff: number
} {
  let maxAbsPctDiff = 0
  let revenueMatches = 0
  let epsMatches = 0
  let revenueCompared = 0
  let epsCompared = 0

  for (const r of rows) {
    if (r.pctDiff === undefined) continue
    maxAbsPctDiff = Math.max(maxAbsPctDiff, Math.abs(r.pctDiff))
    const close = Math.abs(r.pctDiff) <= 3
    if (r.metric === 'revenue') {
      revenueCompared++
      if (close) revenueMatches++
    } else {
      epsCompared++
      if (close) epsMatches++
    }
  }

  return { revenueMatches, epsMatches, revenueCompared, epsCompared, maxAbsPctDiff }
}
