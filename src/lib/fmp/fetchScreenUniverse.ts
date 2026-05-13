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

/**
 * Load a large liquid-US universe for batch screening.
 * Tries FMP stable endpoints first; falls back to a static list if screener fails.
 */
export async function fetchScreenUniverse(apiKey: string, maxTickers: number): Promise<string[]> {
  const cap = Math.max(1, Math.min(maxTickers, 2000))

  try {
    const raw = await fmpGet<unknown>(
      `/stable/company-screener?isEtf=false&isActivelyTrading=true&isFund=false&marketCapMoreThan=1000000000&limit=${cap}`,
      apiKey,
    )
    if (fmpPayloadHasErrorMessage(raw)) throw new Error('FMP screener error payload')
    const rows = asArray<JsonRecord>(raw)
    const syms = uniqueSymbols(rows)
    if (syms.length > 0) {
      return syms.slice(0, cap)
    }
  } catch {
    // try index constituents
  }

  try {
    const sp = await fmpGet<unknown>('/stable/sp500-constituent', apiKey)
    const nq = await fmpGet<unknown>('/stable/nasdaq-constituent', apiKey).catch(() => null)
    const merged = [...uniqueSymbols(asArray<JsonRecord>(sp))]
    if (nq && !fmpPayloadHasErrorMessage(nq)) merged.push(...uniqueSymbols(asArray<JsonRecord>(nq)))
    const dedup = [...new Set(merged)]
    if (dedup.length > 0) {
      return dedup.slice(0, cap)
    }
  } catch {
    // fallback below
  }

  return [...FALLBACK_UNIVERSE].slice(0, Math.min(cap, FALLBACK_UNIVERSE.length))
}
