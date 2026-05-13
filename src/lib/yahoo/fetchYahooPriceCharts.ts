import { parseYahooChartV8ToOhlcv } from './parseYahooChartV8'
import type { OhlcvBar, PriceChartsPayload } from './weeklyChartTypes'
import { yahooSymbolForChart } from './yahooSymbolForChart'

export function yahooChartQuotesToOhlcv(
  quotes: Array<{
    date?: Date
    open?: number | null
    high?: number | null
    low?: number | null
    close?: number | null
    adjclose?: number | null
  }>,
): OhlcvBar[] {
  const bars: OhlcvBar[] = []
  for (const q of quotes) {
    const t = q.date instanceof Date ? q.date.getTime() : NaN
    const c =
      typeof q.adjclose === 'number' && Number.isFinite(q.adjclose)
        ? q.adjclose
        : typeof q.close === 'number' && Number.isFinite(q.close)
          ? q.close
          : NaN
    if (!Number.isFinite(t) || !Number.isFinite(c)) continue
    const o = typeof q.open === 'number' && Number.isFinite(q.open) ? q.open : c
    const hi = typeof q.high === 'number' && Number.isFinite(q.high) ? q.high : Math.max(o, c)
    const lo = typeof q.low === 'number' && Number.isFinite(q.low) ? q.low : Math.min(o, c)
    const h = Math.max(hi, o, c)
    const l = Math.min(lo, o, c)
    bars.push({ t, o, h, l, c })
  }
  return bars
}

export function priceChartsPayloadFromYahooChartPair(
  weeklyResult: {
    meta: { currency?: string; symbol?: string }
    quotes: Array<{
      date?: Date
      open?: number | null
      high?: number | null
      low?: number | null
      close?: number | null
      adjclose?: number | null
    }>
  },
  dailyResult: {
    meta: { currency?: string; symbol?: string }
    quotes: Array<{
      date?: Date
      open?: number | null
      high?: number | null
      low?: number | null
      close?: number | null
      adjclose?: number | null
    }>
  },
  symbolUpper: string,
): PriceChartsPayload {
  return {
    symbol: symbolUpper,
    currency: String(weeklyResult.meta.currency ?? dailyResult.meta.currency ?? 'USD'),
    weekly: yahooChartQuotesToOhlcv(weeklyResult.quotes),
    daily: yahooChartQuotesToOhlcv(dailyResult.quotes),
  }
}

function chartMetaFromJson(data: unknown): { currency: string; symbol: string } {
  const r = (data as { chart?: { result?: Array<{ meta?: { currency?: string; symbol?: string } }> } })?.chart
    ?.result?.[0]
  const meta = r?.meta ?? {}
  return {
    currency: String(meta.currency ?? 'USD'),
    symbol: String(meta.symbol ?? ''),
  }
}

/**
 * ~2y weekly + ~6mo daily OHLC from Yahoo chart JSON (dev middleware or two public v8 requests in prod).
 */
export async function fetchYahooPriceCharts(
  symbol: string,
  options?: { refresh?: boolean; signal?: AbortSignal },
): Promise<PriceChartsPayload> {
  const sym = symbol.trim().toUpperCase()
  if (!sym) throw new Error('Missing symbol')

  if (import.meta.env.DEV) {
    const q = new URLSearchParams({ symbol: sym })
    if (options?.refresh) q.set('refresh', '1')
    const res = await fetch(`/api/dev/yahoo-price-charts?${q.toString()}`, { signal: options?.signal })
    const text = await res.text()
    let body: unknown
    try {
      body = JSON.parse(text) as unknown
    } catch {
      throw new Error(`Yahoo price charts API: invalid JSON (${res.status}) ${text.slice(0, 200)}`)
    }
    if (!res.ok || (body && typeof body === 'object' && 'error' in (body as object))) {
      const o = body && typeof body === 'object' ? (body as { error?: unknown; code?: unknown }) : null
      const code = o?.code !== undefined ? String(o.code) : ''
      const err = o?.error !== undefined ? String(o.error) : text.slice(0, 300)
      if (code === 'YAHOO_RATE_LIMIT' || res.status === 429) {
        throw new Error(err)
      }
      throw new Error(`Yahoo price charts failed (${res.status}): ${err}`)
    }
    return body as PriceChartsPayload
  }

  const ySym = yahooSymbolForChart(sym)
  const wUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=1wk&range=2y`
  const dUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=1d&range=6mo`
  const [rw, rd] = await Promise.all([
    fetch(wUrl, { signal: options?.signal }),
    fetch(dUrl, { signal: options?.signal }),
  ])
  const [tw, td] = await Promise.all([rw.text(), rd.text()])
  let jw: unknown
  let jd: unknown
  try {
    jw = JSON.parse(tw) as unknown
    jd = JSON.parse(td) as unknown
  } catch {
    throw new Error('Yahoo chart: invalid JSON')
  }
  if (!rw.ok || !rd.ok) {
    throw new Error(`Yahoo chart request failed (${rw.status} / ${rd.status})`)
  }
  const weekly = parseYahooChartV8ToOhlcv(jw)
  const daily = parseYahooChartV8ToOhlcv(jd)
  const meta = chartMetaFromJson(jw)
  return {
    symbol: sym,
    currency: meta.currency,
    weekly,
    daily,
  }
}
