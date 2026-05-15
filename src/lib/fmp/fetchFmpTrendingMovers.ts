import { fmpGet } from './http'
import { asArray, type JsonRecord } from './normalize'
import { fmpPayloadHasErrorMessage } from './profileClassification'

function rowSymbol(row: JsonRecord): string | undefined {
  const s = row.symbol ?? row.stock ?? row.ticker
  if (typeof s !== 'string') return undefined
  const u = s.trim().toUpperCase()
  return u || undefined
}

async function tryMoverList(apiKey: string, path: string): Promise<JsonRecord[]> {
  try {
    const raw = await fmpGet<unknown>(path, apiKey)
    if (fmpPayloadHasErrorMessage(raw)) return []
    return asArray<JsonRecord>(raw)
  } catch {
    return []
  }
}

/**
 * Merged “trending” list from FMP market-mover endpoints (gainers → losers → actives),
 * deduped in that order, capped at `limit` symbols. Rank 1 = hottest (earliest kept).
 */
export async function fetchFmpTrendingSymbols(
  apiKey: string,
  opts?: { limit?: number; perList?: number },
): Promise<Map<string, number>> {
  const limit = Math.max(1, Math.min(opts?.limit ?? 100, 200))
  const perList = Math.max(10, Math.min(opts?.perList ?? 45, 100))

  const gainers = await tryMoverList(apiKey, '/stable/biggest-gainers')
  const losers = await tryMoverList(apiKey, '/stable/biggest-losers')

  let actives: JsonRecord[] = []
  for (const path of ['/stable/actives', '/stable/most-active-stock', '/stable/stock_market/actives']) {
    const rows = await tryMoverList(apiKey, path)
    if (rows.length > 0) {
      actives = rows
      break
    }
  }

  const merged: string[] = []
  const seen = new Set<string>()

  for (const list of [gainers, losers, actives]) {
    for (const row of list.slice(0, perList)) {
      const sym = rowSymbol(row)
      if (!sym || seen.has(sym)) continue
      seen.add(sym)
      merged.push(sym)
      if (merged.length >= limit) break
    }
    if (merged.length >= limit) break
  }

  const rank = new Map<string, number>()
  merged.forEach((s, i) => rank.set(s, i + 1))
  return rank
}
