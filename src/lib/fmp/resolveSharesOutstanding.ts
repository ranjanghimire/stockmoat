import { num, type JsonRecord } from './normalize'

function pick(row: JsonRecord | undefined, keys: string[]): number | undefined {
  if (!row) return undefined
  for (const k of keys) {
    const v = num(row[k])
    if (v !== undefined) return v
  }
  return undefined
}

const STATEMENT_SHARE_KEYS = ['weightedAverageShsOutDil', 'weightedAverageShsOut']
const QUOTE_SHARE_KEYS = ['sharesOutstanding', 'weightedAverageShsOutDil', 'weightedAverageShsOut']

export interface ResolveSharesInput {
  marketCap?: number
  price?: number
  keyMetricsTtm?: JsonRecord
  quote?: JsonRecord
  incomeTtm?: JsonRecord
  incomeAnnual0?: JsonRecord
}

/**
 * Resolve diluted shares reconciled with market cap / price.
 * Handles ADR vs ordinary share counts and bad filing units (e.g. TSM annual vs quote).
 */
export function resolveSharesOutstanding(input: ResolveSharesInput): number | undefined {
  const candidates: number[] = []

  for (const v of [
    pick(input.keyMetricsTtm, STATEMENT_SHARE_KEYS),
    pick(input.quote, QUOTE_SHARE_KEYS),
    pick(input.incomeTtm, STATEMENT_SHARE_KEYS),
    pick(input.incomeAnnual0, STATEMENT_SHARE_KEYS),
  ]) {
    if (v !== undefined && v > 0) candidates.push(v)
  }

  const implied =
    input.marketCap !== undefined && input.price !== undefined && input.price > 0
      ? input.marketCap / input.price
      : undefined

  if (implied === undefined || implied <= 0) {
    return candidates[0]
  }

  if (candidates.length === 0) return implied

  let best = candidates[0]!
  let bestLogDelta = Math.abs(Math.log(best / implied))
  for (const c of candidates.slice(1)) {
    const logDelta = Math.abs(Math.log(c / implied))
    if (logDelta < bestLogDelta) {
      best = c
      bestLogDelta = logDelta
    }
  }

  const ratio = best / implied
  if (ratio > 2.5 || ratio < 0.4) return implied

  return best
}
