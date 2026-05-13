import { fmpGet } from './http'
import { fmpPayloadHasErrorMessage } from './profileClassification'
import { asArray, type JsonRecord } from './normalize'

const FALLBACK_UNIVERSE = [
  'AAPL',
  'MSFT',
  'GOOGL',
  'GOOG',
  'AMZN',
  'NVDA',
  'META',
  'TSLA',
  'BRK.B',
  'UNH',
  'JNJ',
  'V',
  'XOM',
  'JPM',
  'WMT',
  'PG',
  'MA',
  'HD',
  'CVX',
  'MRK',
  'ABBV',
  'PEP',
  'COST',
  'KO',
  'AVGO',
  'LLY',
  'MCD',
  'CSCO',
  'TMO',
  'ACN',
  'DHR',
  'ABT',
  'WFC',
  'NEE',
  'DIS',
  'VZ',
  'ADBE',
  'CRM',
  'NKE',
  'PM',
  'TXN',
  'INTC',
  'QCOM',
  'ORCL',
  'AMD',
  'IBM',
  'HON',
  'AMAT',
  'GE',
  'CAT',
] as const

function uniqueSymbols(rows: JsonRecord[]): string[] {
  const out: string[] = []
  for (const row of rows) {
    const s = row.symbol
    if (typeof s === 'string') {
      const u = s.trim().toUpperCase()
      if (u && !out.includes(u)) out.push(u)
    }
  }
  return out
}

export interface FetchScreenUniverseOptions {
  maxTickers: number
  /** Skip the first N symbols from the fetched universe (stable FMP order → use for batched runs). */
  offset?: number
}

/**
 * Load a large liquid-US universe for batch screening.
 * Tries FMP stable endpoints first; falls back to a static list if screener fails.
 * Requests enough rows to honor `offset` + `maxTickers`, then returns that slice.
 */
export async function fetchScreenUniverse(
  apiKey: string,
  opts: FetchScreenUniverseOptions | number,
): Promise<string[]> {
  const maxTickers =
    typeof opts === 'number'
      ? Math.max(1, Math.min(opts, 2000))
      : Math.max(1, Math.min(opts.maxTickers, 2000))
  const offset = typeof opts === 'number' ? 0 : Math.max(0, opts.offset ?? 0)
  const fetchLimit = Math.min(2000, offset + maxTickers)

  try {
    const raw = await fmpGet<unknown>(
      `/stable/company-screener?isEtf=false&isActivelyTrading=true&isFund=false&marketCapMoreThan=1000000000&limit=${fetchLimit}`,
      apiKey,
    )
    if (fmpPayloadHasErrorMessage(raw)) throw new Error('FMP screener error payload')
    const rows = asArray<JsonRecord>(raw)
    const syms = uniqueSymbols(rows)
    if (syms.length > 0) {
      return syms.slice(offset, offset + maxTickers)
    }
  } catch {
    // try index constituents
  }

  try {
    const sp = await fmpGet<unknown>('/stable/sp500-constituent', apiKey)
    if (fmpPayloadHasErrorMessage(sp)) throw new Error('FMP sp500 error payload')
    const nq = await fmpGet<unknown>('/stable/nasdaq-constituent', apiKey).catch(() => null)
    const merged = [...uniqueSymbols(asArray<JsonRecord>(sp))]
    if (nq && !fmpPayloadHasErrorMessage(nq)) merged.push(...uniqueSymbols(asArray<JsonRecord>(nq)))
    const dedup = [...new Set(merged)]
    if (dedup.length > 0) {
      return dedup.slice(offset, offset + maxTickers)
    }
  } catch {
    // fallback below
  }

  return [...FALLBACK_UNIVERSE].slice(offset, offset + maxTickers)
}
