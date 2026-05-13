import type { OhlcvBar } from './weeklyChartTypes'

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v && typeof v === 'object' && 'raw' in v && typeof (v as { raw: unknown }).raw === 'number') {
    const r = (v as { raw: number }).raw
    return Number.isFinite(r) ? r : null
  }
  return null
}

/** Parse Yahoo Finance v8 `/v8/finance/chart` JSON into OHLC bars (browser `fetch` in production). */
export function parseYahooChartV8ToOhlcv(data: unknown): OhlcvBar[] {
  const root = data as {
    chart?: {
      error?: { description?: string }
      result?: Array<{
        meta?: { currency?: string; symbol?: string }
        timestamp?: number[]
        indicators?: {
          quote?: Array<{
            open?: unknown[]
            high?: unknown[]
            low?: unknown[]
            close?: unknown[]
          }>
          adjclose?: Array<{ adjclose?: unknown[] }>
        }
      }>
    }
  }
  const err = root.chart?.error
  if (err?.description) throw new Error(err.description)

  const r = root.chart?.result?.[0]
  if (!r?.timestamp?.length) throw new Error('Yahoo chart: no data in response')

  const quote = r.indicators?.quote?.[0]
  const opens = quote?.open
  const highs = quote?.high
  const lows = quote?.low
  const closes = quote?.close
  const adj = r.indicators?.adjclose?.[0]?.adjclose

  const bars: OhlcvBar[] = []
  for (let i = 0; i < r.timestamp.length; i++) {
    const ts = r.timestamp[i]
    if (typeof ts !== 'number' || !Number.isFinite(ts)) continue
    const c = num(adj?.[i]) ?? num(closes?.[i])
    if (c === null) continue
    const o = num(opens?.[i]) ?? c
    const hi = num(highs?.[i]) ?? Math.max(o, c)
    const lo = num(lows?.[i]) ?? Math.min(o, c)
    if (!Number.isFinite(o) || !Number.isFinite(hi) || !Number.isFinite(lo)) continue
    const h = Math.max(hi, o, c)
    const l = Math.min(lo, o, c)
    bars.push({ t: ts * 1000, o, h, l, c })
  }

  if (bars.length === 0) throw new Error('Yahoo chart: no valid OHLC bars')
  return bars
}
