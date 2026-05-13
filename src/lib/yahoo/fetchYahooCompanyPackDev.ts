import type { CompanyRawPack } from '../fmp/fetchCompanyRawPack'

/**
 * One browser round-trip → Vite dev middleware runs `yahoo-finance2.quoteSummary` once
 * and returns a FMP-shaped `CompanyRawPack` (no FMP key usage).
 */
export async function fetchYahooCompanyPackDev(symbol: string): Promise<CompanyRawPack> {
  const sym = symbol.trim().toUpperCase()
  const res = await fetch(`/api/dev/yahoo-company?symbol=${encodeURIComponent(sym)}`)
  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text) as unknown
  } catch {
    throw new Error(`Yahoo dev API: invalid JSON (${res.status}) ${text.slice(0, 200)}`)
  }
  if (!res.ok || (body && typeof body === 'object' && 'error' in (body as object))) {
    const o = body && typeof body === 'object' ? (body as { error?: unknown; code?: unknown }) : null
    const code = o?.code !== undefined ? String(o.code) : ''
    const err = o?.error !== undefined ? String(o.error) : text.slice(0, 300)
    if (code === 'YAHOO_RATE_LIMIT' || res.status === 429) {
      throw new Error(err)
    }
    throw new Error(`Yahoo dev API failed (${res.status}): ${err}`)
  }
  return body as CompanyRawPack
}
