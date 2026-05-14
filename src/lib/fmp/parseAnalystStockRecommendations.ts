import type { CompanyRawPack } from './fetchCompanyRawPack'
import type { JsonRecord } from './normalize'

export type AnalystConsensusLabel = 'Strong buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong sell'

/** Latest analyst stance from FMP analyst recommendations and/or grades consensus. */
export interface AnalystRecommendationSnapshot {
  /** Best-effort reporting date from the chosen row. */
  asOfDate?: string
  strongBuy: number
  buy: number
  hold: number
  sell: number
  strongSell: number
  totalAnalysts: number
  consensusLabel: AnalystConsensusLabel
}

function nonNegInt(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.round(v)
  if (typeof v === 'string') {
    const t = v.trim()
    if (t === '') return 0
    const n = Number(t)
    if (Number.isFinite(n) && n >= 0) return Math.round(n)
  }
  return 0
}

/** First present key wins; skips null/undefined so a placeholder key does not block real values. */
function pickCount(row: JsonRecord, keys: string[]): number {
  for (const k of keys) {
    if (!(k in row)) continue
    const v = row[k]
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && v.trim() === '') continue
    return nonNegInt(v)
  }
  return 0
}

function rowSortKey(row: JsonRecord): string {
  const raw = row.date ?? row.publishedDate ?? row.filingDate ?? row.lastUpdated ?? row.updatedAt ?? ''
  if (typeof raw === 'number' && Number.isFinite(raw)) return new Date(raw).toISOString().slice(0, 10)
  if (typeof raw !== 'string') return ''
  const s = raw.trim()
  if (s.length >= 10) return s.slice(0, 10)
  return s
}

function consensusFromWeightedAverage(avg: number): AnalystConsensusLabel {
  if (avg >= 4.25) return 'Strong buy'
  if (avg >= 3.5) return 'Buy'
  if (avg >= 2.5) return 'Hold'
  if (avg >= 1.75) return 'Sell'
  return 'Strong sell'
}

function snapshotFromCounts(
  row: JsonRecord,
  strongBuy: number,
  buy: number,
  hold: number,
  sell: number,
  strongSell: number,
): AnalystRecommendationSnapshot | undefined {
  const totalAnalysts = strongBuy + buy + hold + sell + strongSell
  if (totalAnalysts <= 0) return undefined
  const weighted = (strongBuy * 5 + buy * 4 + hold * 3 + sell * 2 + strongSell * 1) / totalAnalysts
  return {
    asOfDate: rowSortKey(row) || undefined,
    strongBuy,
    buy,
    hold,
    sell,
    strongSell,
    totalAnalysts,
    consensusLabel: consensusFromWeightedAverage(weighted),
  }
}

/**
 * Picks the most recent FMP row (by `date` / `publishedDate`) and normalizes counts.
 * Field names vary slightly across FMP payloads; several aliases are accepted.
 */
export function latestAnalystRecommendations(rows: JsonRecord[]): AnalystRecommendationSnapshot | undefined {
  if (!rows.length) return undefined

  const sorted = [...rows].sort((a, b) => rowSortKey(b).localeCompare(rowSortKey(a)))

  for (const row of sorted) {
    const strongBuy = pickCount(row, [
      'analystRatingsStrongBuy',
      'analystRatingsstrongBuy',
      'strongBuy',
      'newStrongBuy',
      'ratingsStrongBuy',
      'StrongBuy',
    ])
    const buy = pickCount(row, [
      'analystRatingsBuy',
      'analystRatingsbuy',
      'buy',
      'newBuy',
      'ratingsBuy',
      'Buy',
    ])
    const hold = pickCount(row, ['analystRatingsHold', 'hold', 'newHold', 'ratingsHold', 'Hold'])
    const sell = pickCount(row, ['analystRatingsSell', 'sell', 'newSell', 'ratingsSell', 'Sell'])
    const strongSell = pickCount(row, [
      'analystRatingsStrongSell',
      'analystRatingsstrongSell',
      'strongSell',
      'newStrongSell',
      'ratingsStrongSell',
      'StrongSell',
    ])

    const snap = snapshotFromCounts(row, strongBuy, buy, hold, sell, strongSell)
    if (snap) return snap
  }

  return undefined
}

/** Single-row summary from `/stable/grades-consensus` (field names vary by feed version). */
export function parseGradesConsensusRow(row: JsonRecord | undefined): AnalystRecommendationSnapshot | undefined {
  if (!row) return undefined
  const strongBuy = pickCount(row, [
    'strongBuy',
    'StrongBuy',
    'strongBuyRatings',
    'analystRatingsStrongBuy',
    'analystRatingsstrongBuy',
    'newStrongBuy',
    'ratingsStrongBuy',
  ])
  const buy = pickCount(row, [
    'buy',
    'Buy',
    'buyRatings',
    'analystRatingsBuy',
    'analystRatingsbuy',
    'newBuy',
    'ratingsBuy',
  ])
  const hold = pickCount(row, ['hold', 'Hold', 'holdRatings', 'analystRatingsHold', 'newHold', 'ratingsHold'])
  const sell = pickCount(row, ['sell', 'Sell', 'sellRatings', 'analystRatingsSell', 'newSell', 'ratingsSell'])
  const strongSell = pickCount(row, [
    'strongSell',
    'StrongSell',
    'strongSellRatings',
    'analystRatingsStrongSell',
    'analystRatingsstrongSell',
    'newStrongSell',
    'ratingsStrongSell',
  ])
  return snapshotFromCounts(row, strongBuy, buy, hold, sell, strongSell)
}

export function analystRecommendationFromFmpPack(pack: CompanyRawPack): AnalystRecommendationSnapshot | undefined {
  return (
    latestAnalystRecommendations(pack.analystStockRecommendations ?? []) ??
    parseGradesConsensusRow(pack.gradesConsensus)
  )
}
