const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json'
const SEC_DATA_HEADERS = {
  'User-Agent': 'StockMoat/1.0 (news-pipeline; contact: support@stockmoat.local)',
  Accept: 'application/json',
}

type TickerJson = Record<string, { cik_str: number; ticker: string; title: string }>

let tickerToCikCache: Map<string, string> | null = null

function padCik(cik: string | number): string {
  const digits = String(cik).replace(/\D/g, '')
  return digits.padStart(10, '0')
}

export async function loadSecTickerCikMap(userAgent?: string): Promise<Map<string, string>> {
  if (tickerToCikCache) return tickerToCikCache
  const headers = { ...SEC_DATA_HEADERS, 'User-Agent': userAgent?.trim() || SEC_DATA_HEADERS['User-Agent'] }
  const res = await fetch(SEC_TICKERS_URL, { headers })
  if (!res.ok) throw new Error(`SEC company_tickers.json failed (${res.status})`)
  const raw = (await res.json()) as TickerJson
  const map = new Map<string, string>()
  for (const entry of Object.values(raw)) {
    if (!entry?.ticker || entry.cik_str == null) continue
    map.set(entry.ticker.trim().toUpperCase(), padCik(entry.cik_str))
  }
  tickerToCikCache = map
  return map
}

export function resolveCik(symbol: string, map: Map<string, string>): string | null {
  const sym = symbol.trim().toUpperCase()
  if (map.has(sym)) return map.get(sym)!
  // BRK.B → try BRK-B style
  const alt = sym.replace('.', '-')
  if (map.has(alt)) return map.get(alt)!
  const dot = sym.replace('-', '.')
  if (map.has(dot)) return map.get(dot)!
  return null
}

export function cikToSubmissionsPath(cik: string): string {
  const padded = padCik(cik)
  return `https://data.sec.gov/submissions/CIK${padded}.json`
}

export function accessionToFilingBase(cik: string, accessionNumber: string): string {
  const cikNum = String(Number.parseInt(padCik(cik), 10))
  const accNoDash = accessionNumber.replace(/-/g, '')
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNoDash}`
}
